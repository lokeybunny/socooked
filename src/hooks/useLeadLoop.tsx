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

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming',
];

interface LeadLoopState {
  active: boolean;
  generating: boolean;
  interval: number | null;
  currentIndustryIdx: number;
  currentStateIdx: number;
  allStates: boolean;
  cyclesCompleted: number;
  totalLeadsFound: number;
  totalNewCreated: number;
  progressLog: Array<{ step: number; label: string; status: string; detail: string; ts: string }>;
}

interface LeadLoopContextType {
  loopState: LeadLoopState;
  setInterval: (mins: number | null) => void;
  setAllStates: (val: boolean) => void;
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
          currentStateIdx: parsed.currentStateIdx || 0,
          allStates: parsed.allStates || false,
          cyclesCompleted: parsed.cyclesCompleted || 0,
          totalLeadsFound: parsed.totalLeadsFound || 0,
          totalNewCreated: parsed.totalNewCreated || 0,
          progressLog: parsed.active ? [{ step: -1, label: '♻️ Resumed', status: 'done', detail: 'Lead loop restored from previous session', ts: now() }] : [],
        };
      }
    } catch {}
    return { active: false, generating: false, interval: null, currentIndustryIdx: 0, currentStateIdx: 0, allStates: false, cyclesCompleted: 0, totalLeadsFound: 0, totalNewCreated: 0, progressLog: [] };
  });

  const activeRef = useRef(loopState.active);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatingRef = useRef(false);
  const industryIdxRef = useRef(loopState.currentIndustryIdx);
  const stateIdxRef = useRef(loopState.currentStateIdx);
  const allStatesRef = useRef(loopState.allStates);
  const intervalRef = useRef(loopState.interval);

  // Keep refs in sync
  useEffect(() => { intervalRef.current = loopState.interval; }, [loopState.interval]);
  useEffect(() => { industryIdxRef.current = loopState.currentIndustryIdx; }, [loopState.currentIndustryIdx]);
  useEffect(() => { stateIdxRef.current = loopState.currentStateIdx; }, [loopState.currentStateIdx]);
  useEffect(() => { allStatesRef.current = loopState.allStates; }, [loopState.allStates]);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      active: loopState.active,
      interval: loopState.interval,
      currentIndustryIdx: loopState.currentIndustryIdx,
      currentStateIdx: loopState.currentStateIdx,
      allStates: loopState.allStates,
      cyclesCompleted: loopState.cyclesCompleted,
      totalLeadsFound: loopState.totalLeadsFound,
      totalNewCreated: loopState.totalNewCreated,
    }));
  }, [loopState.active, loopState.interval, loopState.currentIndustryIdx, loopState.currentStateIdx, loopState.allStates, loopState.cyclesCompleted, loopState.totalLeadsFound, loopState.totalNewCreated]);

  const addLog = useCallback((entry: LeadLoopState['progressLog'][0]) => {
    setLoopState(prev => ({ ...prev, progressLog: [...prev.progressLog.slice(-50), entry] }));
  }, []);

  const runGenerate = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;

    const industry = TARGET_INDUSTRIES[industryIdxRef.current % TARGET_INDUSTRIES.length];
    const nextIdx = (industryIdxRef.current + 1) % TARGET_INDUSTRIES.length;
    industryIdxRef.current = nextIdx;

    // Determine location based on allStates toggle
    let location: string[];
    let locationLabel: string;
    if (allStatesRef.current) {
      const state = US_STATES[stateIdxRef.current % US_STATES.length];
      const nextStateIdx = (stateIdxRef.current + 1) % US_STATES.length;
      stateIdxRef.current = nextStateIdx;
      location = [state];
      locationLabel = state;
      setLoopState(prev => ({ ...prev, currentStateIdx: nextStateIdx }));
    } else {
      location = ['las vegas'];
      locationLabel = 'Las Vegas';
    }

    setLoopState(prev => ({
      ...prev,
      generating: true,
      currentIndustryIdx: nextIdx,
      progressLog: [
        ...prev.progressLog.slice(-50),
        { step: -1, label: '🚀 Lead Agent', status: 'done', detail: `Targeting: ${industry} in ${locationLabel}`, ts: now() },
      ],
    }));

    addLog({ step: 1, label: 'Searching', status: 'running', detail: `Industry: ${industry} | Location: ${locationLabel} | Titles: ${TARGET_JOB_TITLES.slice(0, 3).join(', ')}...`, ts: now() });

    try {
      const { data, error } = await supabase.functions.invoke('lead-finder', {
        body: {
          company_industry: [industry],
          contact_job_title: TARGET_JOB_TITLES,
          contact_location: location,
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

  const setAllStatesVal = useCallback((val: boolean) => {
    setLoopState(prev => ({ ...prev, allStates: val }));
    allStatesRef.current = val;
  }, []);

  const clearLog = useCallback(() => {
    setLoopState(prev => ({ ...prev, progressLog: [], cyclesCompleted: 0, totalLeadsFound: 0, totalNewCreated: 0 }));
  }, []);

  return (
    <LeadLoopContext.Provider value={{
      loopState,
      setInterval: setIntervalMins,
      setAllStates: setAllStatesVal,
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
