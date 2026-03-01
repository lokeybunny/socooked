import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Industries most likely to need web design + social media management services.
 * The loop cycles through these automatically, one per run.
 */
const TARGET_INDUSTRIES = [
  'restaurants',
  'real estate',
  'health, wellness & fitness',
  'hospitality',
  'food & beverages',
  'retail',
  'apparel & fashion',
  'events services',
  'professional training & coaching',
  'consumer services',
  'photography',
  'arts & crafts',
  'design',
  'education management',
  'leisure, travel & tourism',
  'cosmetics',
  'sporting goods',
  'entertainment',
  'architecture & planning',
  'legal services',
  'accounting',
  'insurance',
  'automotive',
  'staffing & recruiting',
  'veterinary',
  'furniture',
  'wine & spirits',
];

const TARGET_JOB_TITLES = [
  'Owner',
  'Founder',
  'CEO',
  'Marketing Manager',
  'Marketing Director',
  'General Manager',
  'Managing Director',
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
  const [loopState, setLoopState] = useState<LeadLoopState>({
    active: false,
    generating: false,
    interval: null,
    currentIndustryIdx: 0,
    cyclesCompleted: 0,
    totalLeadsFound: 0,
    totalNewCreated: 0,
    progressLog: [],
  });

  const activeRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatingRef = useRef(false);
  const industryIdxRef = useRef(0);

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

      // Schedule next if loop is active
      if (activeRef.current) {
        const interval = loopState.interval;
        if (interval) {
          const ms = interval * 60 * 1000;
          addLog({ step: -2, label: 'Loop', status: 'done', detail: `⏳ Next industry in ${interval}m → ${TARGET_INDUSTRIES[industryIdxRef.current % TARGET_INDUSTRIES.length]}`, ts: now() });
          timerRef.current = setTimeout(() => {
            if (activeRef.current) runGenerate();
          }, ms);
        }
      }
    }
  }, [loopState.interval, addLog]);

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

  const clearLog = useCallback(() => {
    setLoopState(prev => ({ ...prev, progressLog: [], cyclesCompleted: 0, totalLeadsFound: 0, totalNewCreated: 0 }));
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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
