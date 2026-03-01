import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

interface LoopState {
  active: boolean;
  generating: boolean;
  interval: number | null;
  sources: ('x' | 'tiktok')[];
  progressLog: Array<{ step: number; label: string; status: string; detail: string; ts: string }>;
}

interface ResearchLoopContextType {
  loopState: LoopState;
  setInterval: (mins: number | null) => void;
  setSources: (sources: ('x' | 'tiktok')[]) => void;
  startLoop: () => void;
  stopLoop: () => void;
  runOnce: () => void;
  clearLog: () => void;
  // Callbacks for UI to consume results
  onComplete: React.MutableRefObject<((data: any) => void) | null>;
}

const ResearchLoopContext = createContext<ResearchLoopContextType | null>(null);

export function ResearchLoopProvider({ children }: { children: React.ReactNode }) {
  const [loopState, setLoopState] = useState<LoopState>({
    active: false,
    generating: false,
    interval: null,
    sources: ['x', 'tiktok'],
    progressLog: [],
  });

  const activeRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatingRef = useRef(false);
  const onComplete = useRef<((data: any) => void) | null>(null);

  const now = () => new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const addLog = useCallback((entry: LoopState['progressLog'][0]) => {
    setLoopState(prev => ({ ...prev, progressLog: [...prev.progressLog, entry] }));
  }, []);

  const updateLog = useCallback((entry: LoopState['progressLog'][0]) => {
    setLoopState(prev => {
      const existing = prev.progressLog.findIndex(p => p.step === entry.step && p.label === entry.label);
      if (existing >= 0) {
        const updated = [...prev.progressLog];
        updated[existing] = entry;
        return { ...prev, progressLog: updated };
      }
      return { ...prev, progressLog: [...prev.progressLog, entry] };
    });
  }, []);

  const runGenerate = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setLoopState(prev => ({ ...prev, generating: true, progressLog: [{ step: -1, label: 'Cortex activated', status: 'done', detail: '🚀 Researching live narratives now...', ts: now() }] }));

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
        body: JSON.stringify({ sources: loopState.sources }),
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

      // Schedule next if loop is active
      if (activeRef.current && loopState.interval) {
        const ms = loopState.interval * 60 * 1000;
        addLog({ step: -2, label: 'Loop', status: 'done', detail: `⏳ Next cycle in ${loopState.interval}m...`, ts: now() });
        timerRef.current = setTimeout(() => {
          if (activeRef.current) runGenerate();
        }, ms);
      }
    }
  }, [loopState.sources, loopState.interval, addLog, updateLog]);

  const startLoop = useCallback(() => {
    if (!loopState.interval) return;
    activeRef.current = true;
    setLoopState(prev => ({ ...prev, active: true }));
    runGenerate();
  }, [loopState.interval, runGenerate]);

  const stopLoop = useCallback(() => {
    activeRef.current = false;
    setLoopState(prev => ({ ...prev, active: false }));
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runOnce = useCallback(() => {
    runGenerate();
  }, [runGenerate]);

  const setIntervalMins = useCallback((mins: number | null) => {
    setLoopState(prev => ({ ...prev, interval: mins }));
  }, []);

  const setSources = useCallback((sources: ('x' | 'tiktok')[]) => {
    setLoopState(prev => ({ ...prev, sources }));
  }, []);

  const clearLog = useCallback(() => {
    setLoopState(prev => ({ ...prev, progressLog: [] }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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
