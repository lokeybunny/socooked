import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'lead-loop-state';

const TARGET_INDUSTRIES = [
  'restaurants', 'real estate', 'health, wellness & fitness', 'hospitality',
  'food & beverages', 'retail', 'apparel & fashion', 'events services',
  'professional training & coaching', 'consumer services', 'photography',
  'arts & crafts', 'design', 'education management', 'leisure, travel & tourism',
  'cosmetics', 'sporting goods', 'entertainment', 'architecture & planning',
  'legal services', 'accounting', 'insurance', 'automotive',
  'staffing & recruiting', 'veterinary', 'furniture', 'wine & spirits',
];

const TARGET_JOB_TITLES = [
  'Owner', 'Founder', 'CEO', 'Marketing Manager',
  'Marketing Director', 'General Manager', 'Managing Director',
];

interface LeadLoopState {
  active: boolean;
  generating: boolean;
  interval: number | null;
  currentIndustryIdx: number;
  cyclesCompleted: number;
  totalLeadsFound: number;
  totalNewCreated: number;
  progressLog: Array<{ step: number; label: string; status: string; detail: string; ts: string }>;
}

interface LeadLoopContextType {
  loopState: LeadLoopState;
  setInterval: (mins: number | null) => void;
  startLoop: () => void;
  stopLoop: () => void;
  runOnce: () => void;
  clearLog: () => void;
  targetIndustries: string[];
}

const LeadLoopContext = createContext<LeadLoopContextType | null>(null);

const now = () => new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function LeadLoopProvider({ children }: { children: React.ReactNode }) {
  const [loopState, setLoopState] = useState<LeadLoopState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          active: parsed.active || false,
          generating: false,
          interval: parsed.interval || null,
          currentIndustryIdx: parsed.currentIndustryIdx || 0,
          cyclesCompleted: parsed.cyclesCompleted || 0,
          totalLeadsFound: parsed.totalLeadsFound || 0,
          totalNewCreated: parsed.totalNewCreated || 0,
          progressLog: parsed.active ? [{ step: -1, label: '♻️ Resumed', status: 'done', detail: 'Lead loop restored from previous session', ts: now() }] : [],
        };
      }
    } catch {}
    return { active: false, generating: false, interval: null, currentIndustryIdx: 0, cyclesCompleted: 0, totalLeadsFound: 0, totalNewCreated: 0, progressLog: [] };
  });

  const activeRef = useRef(loopState.active);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatingRef = useRef(false);
  const industryIdxRef = useRef(loopState.currentIndustryIdx);
  const intervalRef = useRef(loopState.interval);

  // Keep refs in sync
  useEffect(() => { intervalRef.current = loopState.interval; }, [loopState.interval]);
  useEffect(() => { industryIdxRef.current = loopState.currentIndustryIdx; }, [loopState.currentIndustryIdx]);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      active: loopState.active,
      interval: loopState.interval,
      currentIndustryIdx: loopState.currentIndustryIdx,
      cyclesCompleted: loopState.cyclesCompleted,
      totalLeadsFound: loopState.totalLeadsFound,
      totalNewCreated: loopState.totalNewCreated,
    }));
  }, [loopState.active, loopState.interval, loopState.currentIndustryIdx, loopState.cyclesCompleted, loopState.totalLeadsFound, loopState.totalNewCreated]);

  const addLog = useCallback((entry: LeadLoopState['progressLog'][0]) => {
    setLoopState(prev => ({ ...prev, progressLog: [...prev.progressLog.slice(-50), entry] }));
  }, []);

  const runGenerate = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;

    const industry = TARGET_INDUSTRIES[industryIdxRef.current % TARGET_INDUSTRIES.length];
    const nextIdx = (industryIdxRef.current + 1) % TARGET_INDUSTRIES.length;
    industryIdxRef.current = nextIdx;

    setLoopState(prev => ({
      ...prev,
      generating: true,
      currentIndustryIdx: nextIdx,
      progressLog: [
        ...prev.progressLog.slice(-50),
        { step: -1, label: '🚀 Lead Agent', status: 'done', detail: `Targeting: ${industry}`, ts: now() },
      ],
    }));

    addLog({ step: 1, label: 'Searching', status: 'running', detail: `Industry: ${industry} | Titles: ${TARGET_JOB_TITLES.slice(0, 3).join(', ')}...`, ts: now() });

    try {
      const { data, error } = await supabase.functions.invoke('lead-finder', {
        body: {
          company_industry: [industry],
          contact_job_title: TARGET_JOB_TITLES,
          contact_location: ['united states'],
          fetch_count: 25,
        },
      });

      if (error) throw new Error(error.message);

      const found = data?.total_found || 0;
      const created = data?.created_count || 0;

      addLog({
        step: 2,
        label: 'Complete',
        status: 'done',
        detail: `✅ ${found} leads found, ${created} new added (${industry})`,
        ts: now(),
      });

      setLoopState(prev => ({
        ...prev,
        cyclesCompleted: prev.cyclesCompleted + 1,
        totalLeadsFound: prev.totalLeadsFound + found,
        totalNewCreated: prev.totalNewCreated + created,
      }));
    } catch (err: any) {
      addLog({ step: 99, label: 'Error', status: 'error', detail: err.message || 'Failed', ts: now() });
    } finally {
      generatingRef.current = false;
      setLoopState(prev => ({ ...prev, generating: false }));

      // Schedule next if loop is active — use refs for current values
      if (activeRef.current) {
        const interval = intervalRef.current;
        if (interval) {
          const ms = interval * 60 * 1000;
          addLog({ step: -2, label: 'Loop', status: 'done', detail: `⏳ Next industry in ${interval}m → ${TARGET_INDUSTRIES[industryIdxRef.current % TARGET_INDUSTRIES.length]}`, ts: now() });
          timerRef.current = setTimeout(() => {
            if (activeRef.current) runGenerate();
          }, ms);
        }
      }
    }
  }, [addLog]);

  // Auto-resume on mount if was active
  useEffect(() => {
    if (activeRef.current && intervalRef.current && !generatingRef.current) {
      timerRef.current = setTimeout(() => {
        if (activeRef.current) runGenerate();
      }, 3000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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
    // Run once starts infinite loop until Stop is pressed
    activeRef.current = true;
    setLoopState(prev => ({ ...prev, active: true, interval: prev.interval || 5 }));
    intervalRef.current = intervalRef.current || 5;
    runGenerate();
  }, [runGenerate]);

  const setIntervalMins = useCallback((mins: number | null) => {
    setLoopState(prev => ({ ...prev, interval: mins }));
    intervalRef.current = mins;
  }, []);

  const clearLog = useCallback(() => {
    setLoopState(prev => ({ ...prev, progressLog: [], cyclesCompleted: 0, totalLeadsFound: 0, totalNewCreated: 0 }));
  }, []);

  return (
    <LeadLoopContext.Provider value={{
      loopState,
      setInterval: setIntervalMins,
      startLoop,
      stopLoop,
      runOnce,
      clearLog,
      targetIndustries: TARGET_INDUSTRIES,
    }}>
      {children}
    </LeadLoopContext.Provider>
  );
}

export function useLeadLoop() {
  const ctx = useContext(LeadLoopContext);
  if (!ctx) throw new Error('useLeadLoop must be inside LeadLoopProvider');
  return ctx;
}
