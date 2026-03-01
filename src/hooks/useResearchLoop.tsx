import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'research-loop-state';

interface LoopState {
  active: boolean;
  generating: boolean;
  interval: number | null;
  sources: ('x')[];
  progressLog: Array<{ step: number; label: string; status: string; detail: string; ts: string }>;
}

interface ResearchLoopContextType {
  loopState: LoopState;
  setInterval: (mins: number | null) => void;
  setSources: (sources: ('x')[]) => void;
  startLoop: () => void;
  stopLoop: () => void;
  runOnce: () => void;
  clearLog: () => void;
  onComplete: React.MutableRefObject<((data: any) => void) | null>;
}

const ResearchLoopContext = createContext<ResearchLoopContextType | null>(null);

export function ResearchLoopProvider({ children }: { children: React.ReactNode }) {
  const [loopState, setLoopState] = useState<LoopState>(() => {
    // Restore persisted state
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // If it was active, we'll re-trigger it
        return {
          active: parsed.active || false,
          generating: false,
          interval: parsed.interval || null,
          sources: parsed.sources || ['x'],
          progressLog: parsed.active ? [{ step: -1, label: '♻️ Resumed', status: 'done', detail: 'Loop restored from previous session', ts: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) }] : [],
        };
      }
    } catch {}
    return { active: false, generating: false, interval: null, sources: ['x'], progressLog: [] };
  });

  const activeRef = useRef(loopState.active);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatingRef = useRef(false);
  const intervalRef = useRef(loopState.interval);
  const sourcesRef = useRef(loopState.sources);
  const onComplete = useRef<((data: any) => void) | null>(null);

  // Keep refs in sync
  useEffect(() => { intervalRef.current = loopState.interval; }, [loopState.interval]);
  useEffect(() => { sourcesRef.current = loopState.sources; }, [loopState.sources]);

  // Persist active + interval to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      active: loopState.active,
      interval: loopState.interval,
      sources: loopState.sources,
    }));
  }, [loopState.active, loopState.interval, loopState.sources]);

  const now = () => new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const addLog = useCallback((entry: LoopState['progressLog'][0]) => {
    setLoopState(prev => ({ ...prev, progressLog: [...prev.progressLog.slice(-50), entry] }));
  }, []);

  const updateLog = useCallback((entry: LoopState['progressLog'][0]) => {
    setLoopState(prev => {
      const existing = prev.progressLog.findIndex(p => p.step === entry.step && p.label === entry.label);
      if (existing >= 0) {
        const updated = [...prev.progressLog];
        updated[existing] = entry;
        return { ...prev, progressLog: updated };
      }
      return { ...prev, progressLog: [...prev.progressLog.slice(-50), entry] };
    });
  }, []);

  const runGenerate = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setLoopState(prev => ({ ...prev, generating: true, progressLog: [...prev.progressLog.slice(-50), { step: -1, label: 'Cortex activated', status: 'done', detail: '🚀 Researching live narratives now...', ts: now() }] }));

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spacebot-research`;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sources: sourcesRef.current }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';

        for (const msg of messages) {
          if (!msg.trim()) continue;
          const lines = msg.split('\n');
          let eventType = '';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataStr += line.slice(6);
          }
          if (!eventType || !dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            const ts = now();
            if (eventType === 'progress') {
              updateLog({ step: data.step, label: data.label, status: data.status, detail: data.detail, ts });
            } else if (eventType === 'complete') {
              onComplete.current?.(data);
            } else if (eventType === 'warning') {
              addLog({ step: 98, label: '⚠️ Warning', status: 'warning', detail: data.message || 'Unknown warning', ts });
            } else if (eventType === 'error') {
              addLog({ step: 99, label: 'Error', status: 'error', detail: data.message || 'Unknown error', ts });
            }
          } catch { /* skip bad JSON */ }
        }
      }
    } catch (err: any) {
      addLog({ step: 99, label: 'Connection error', status: 'error', detail: err.message || 'Failed to connect', ts: now() });
    } finally {
      generatingRef.current = false;
      setLoopState(prev => ({ ...prev, generating: false }));

      // Schedule next if loop is active — use refs for current values
      if (activeRef.current && intervalRef.current) {
        const ms = intervalRef.current * 60 * 1000;
        addLog({ step: -2, label: 'Loop', status: 'done', detail: `⏳ Next cycle in ${intervalRef.current}m...`, ts: now() });
        timerRef.current = setTimeout(() => {
          if (activeRef.current) runGenerate();
        }, ms);
      }
    }
  }, [addLog, updateLog]);

  // Auto-resume loop on mount if it was active
  useEffect(() => {
    if (activeRef.current && intervalRef.current && !generatingRef.current) {
      const delay = 3000; // small delay to let app settle
      timerRef.current = setTimeout(() => {
        if (activeRef.current) runGenerate();
      }, delay);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []); // only on mount

  const startLoop = useCallback(() => {
    if (!intervalRef.current) return;
    activeRef.current = true;
    setLoopState(prev => ({ ...prev, active: true }));
    runGenerate();
  }, [runGenerate]);

  const stopLoop = useCallback(() => {
    activeRef.current = false;
    setLoopState(prev => ({ ...prev, active: false }));
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runOnce = useCallback(() => {
    // "Run once" now starts infinite loop — keeps going until user hits Stop
    activeRef.current = true;
    setLoopState(prev => ({ ...prev, active: true, interval: prev.interval || 5 }));
    intervalRef.current = intervalRef.current || 5;
    runGenerate();
  }, [runGenerate]);

  const setIntervalMins = useCallback((mins: number | null) => {
    setLoopState(prev => ({ ...prev, interval: mins }));
    intervalRef.current = mins;
  }, []);

  const setSources = useCallback((sources: ('x')[]) => {
    setLoopState(prev => ({ ...prev, sources }));
    sourcesRef.current = sources;
  }, []);

  const clearLog = useCallback(() => {
    setLoopState(prev => ({ ...prev, progressLog: [] }));
  }, []);

  return (
    <ResearchLoopContext.Provider value={{
      loopState,
      setInterval: setIntervalMins,
      setSources,
      startLoop,
      stopLoop,
      runOnce,
      clearLog,
      onComplete,
    }}>
      {children}
    </ResearchLoopContext.Provider>
  );
}

export function useResearchLoop() {
  const ctx = useContext(ResearchLoopContext);
  if (!ctx) throw new Error('useResearchLoop must be inside ResearchLoopProvider');
  return ctx;
}
