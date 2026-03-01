import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'yelp-loop-state';

const TARGET_SEARCH_TERMS = [
  'restaurant', 'barber shop', 'nail salon', 'auto repair', 'dentist',
  'plumber', 'electrician', 'roofing', 'landscaping', 'cleaning service',
  'pest control', 'hvac', 'moving company', 'photographer', 'catering',
  'gym', 'yoga studio', 'pet grooming', 'veterinarian', 'florist',
  'bakery', 'coffee shop', 'bar', 'nightclub', 'car wash',
  'tattoo shop', 'spa', 'massage', 'chiropractor', 'lawyer',
  'accountant', 'real estate agent', 'insurance agent', 'daycare',
  'tutoring', 'music lessons', 'dance studio', 'martial arts',
  'web design', 'marketing agency',
];

const US_CITIES = [
  'Las Vegas, NV', 'Los Angeles, CA', 'Miami, FL', 'Houston, TX', 'Phoenix, AZ',
  'San Antonio, TX', 'Dallas, TX', 'San Diego, CA', 'Chicago, IL', 'New York, NY',
  'Atlanta, GA', 'Denver, CO', 'Seattle, WA', 'Portland, OR', 'Nashville, TN',
  'Austin, TX', 'Tampa, FL', 'Orlando, FL', 'Charlotte, NC', 'Raleigh, NC',
  'Salt Lake City, UT', 'Sacramento, CA', 'San Jose, CA', 'Minneapolis, MN',
  'Detroit, MI', 'St. Louis, MO', 'Kansas City, MO', 'Cleveland, OH',
  'Columbus, OH', 'Indianapolis, IN', 'Milwaukee, WI', 'Memphis, TN',
  'Louisville, KY', 'Oklahoma City, OK', 'Tucson, AZ', 'Albuquerque, NM',
  'Jacksonville, FL', 'New Orleans, LA', 'Birmingham, AL', 'Richmond, VA',
  'Boise, ID', 'Honolulu, HI', 'Anchorage, AK', 'Des Moines, IA',
  'Omaha, NE', 'Tulsa, OK', 'El Paso, TX', 'Henderson, NV',
  'North Las Vegas, NV', 'Reno, NV',
];

interface YelpLoopState {
  active: boolean;
  generating: boolean;
  interval: number | null;
  currentTermIdx: number;
  currentCityIdx: number;
  allCities: boolean;
  cyclesCompleted: number;
  totalFound: number;
  totalNewCreated: number;
  progressLog: Array<{ step: number; label: string; status: string; detail: string; ts: string }>;
}

interface YelpLoopContextType {
  loopState: YelpLoopState;
  setInterval: (mins: number | null) => void;
  setAllCities: (val: boolean) => void;
  startLoop: () => void;
  stopLoop: () => void;
  runOnce: () => void;
  clearLog: () => void;
  targetSearchTerms: string[];
}

const YelpLoopContext = createContext<YelpLoopContextType | null>(null);

const now = () => new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function YelpLoopProvider({ children }: { children: React.ReactNode }) {
  const [loopState, setLoopState] = useState<YelpLoopState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          active: parsed.active || false,
          generating: false,
          interval: parsed.interval || null,
          currentTermIdx: parsed.currentTermIdx || 0,
          currentCityIdx: parsed.currentCityIdx || 0,
          allCities: parsed.allCities || false,
          cyclesCompleted: parsed.cyclesCompleted || 0,
          totalFound: parsed.totalFound || 0,
          totalNewCreated: parsed.totalNewCreated || 0,
          progressLog: parsed.active ? [{ step: -1, label: '♻️ Resumed', status: 'done', detail: 'Yelp loop restored from previous session', ts: now() }] : [],
        };
      }
    } catch {}
    return { active: false, generating: false, interval: null, currentTermIdx: 0, currentCityIdx: 0, allCities: false, cyclesCompleted: 0, totalFound: 0, totalNewCreated: 0, progressLog: [] };
  });

  const activeRef = useRef(loopState.active);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatingRef = useRef(false);
  const termIdxRef = useRef(loopState.currentTermIdx);
  const cityIdxRef = useRef(loopState.currentCityIdx);
  const allCitiesRef = useRef(loopState.allCities);
  const intervalRef = useRef(loopState.interval);

  useEffect(() => { intervalRef.current = loopState.interval; }, [loopState.interval]);
  useEffect(() => { termIdxRef.current = loopState.currentTermIdx; }, [loopState.currentTermIdx]);
  useEffect(() => { cityIdxRef.current = loopState.currentCityIdx; }, [loopState.currentCityIdx]);
  useEffect(() => { allCitiesRef.current = loopState.allCities; }, [loopState.allCities]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      active: loopState.active,
      interval: loopState.interval,
      currentTermIdx: loopState.currentTermIdx,
      currentCityIdx: loopState.currentCityIdx,
      allCities: loopState.allCities,
      cyclesCompleted: loopState.cyclesCompleted,
      totalFound: loopState.totalFound,
      totalNewCreated: loopState.totalNewCreated,
    }));
  }, [loopState.active, loopState.interval, loopState.currentTermIdx, loopState.currentCityIdx, loopState.allCities, loopState.cyclesCompleted, loopState.totalFound, loopState.totalNewCreated]);

  const addLog = useCallback((entry: YelpLoopState['progressLog'][0]) => {
    setLoopState(prev => ({ ...prev, progressLog: [...prev.progressLog.slice(-50), entry] }));
  }, []);

  const runGenerate = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;

    const searchTerm = TARGET_SEARCH_TERMS[termIdxRef.current % TARGET_SEARCH_TERMS.length];
    const nextTermIdx = (termIdxRef.current + 1) % TARGET_SEARCH_TERMS.length;
    termIdxRef.current = nextTermIdx;

    let location: string;
    if (allCitiesRef.current) {
      const city = US_CITIES[cityIdxRef.current % US_CITIES.length];
      const nextCityIdx = (cityIdxRef.current + 1) % US_CITIES.length;
      cityIdxRef.current = nextCityIdx;
      location = city;
      setLoopState(prev => ({ ...prev, currentCityIdx: nextCityIdx }));
    } else {
      location = 'Las Vegas, NV';
    }

    setLoopState(prev => ({
      ...prev,
      generating: true,
      currentTermIdx: nextTermIdx,
      progressLog: [
        ...prev.progressLog.slice(-50),
        { step: -1, label: '⭐ Yelp Agent', status: 'done', detail: `Targeting: "${searchTerm}" in ${location}`, ts: now() },
      ],
    }));

    addLog({ step: 1, label: 'Searching Yelp', status: 'running', detail: `"${searchTerm}" in ${location} (≤3★ filter)`, ts: now() });

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 210_000);

      const resp = await fetch(`${supabaseUrl}/functions/v1/yelp-finder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          searchTerms: [searchTerm],
          location,
          maxItems: 30,
          sortBy: 'rating',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        throw new Error(errBody || `Request failed (${resp.status})`);
      }
      const data = await resp.json();

      const found = data?.low_rated_count || 0;
      const created = data?.created_count || 0;

      addLog({
        step: 2,
        label: 'Complete',
        status: 'done',
        detail: `✅ ${found} low-rated found, ${created} new added ("${searchTerm}" in ${location})`,
        ts: now(),
      });

      setLoopState(prev => ({
        ...prev,
        cyclesCompleted: prev.cyclesCompleted + 1,
        totalFound: prev.totalFound + found,
        totalNewCreated: prev.totalNewCreated + created,
      }));
    } catch (err: any) {
      addLog({ step: 99, label: 'Error', status: 'error', detail: err.message || 'Failed', ts: now() });
    } finally {
      generatingRef.current = false;
      setLoopState(prev => ({ ...prev, generating: false }));

      if (activeRef.current) {
        const interval = intervalRef.current;
        if (interval) {
          const ms = interval * 60 * 1000;
          addLog({ step: -2, label: 'Loop', status: 'done', detail: `⏳ Next search in ${interval}m → "${TARGET_SEARCH_TERMS[termIdxRef.current % TARGET_SEARCH_TERMS.length]}"`, ts: now() });
          timerRef.current = setTimeout(() => {
            if (activeRef.current) runGenerate();
          }, ms);
        }
      }
    }
  }, [addLog]);

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
    activeRef.current = true;
    setLoopState(prev => ({ ...prev, active: true, interval: prev.interval || 5 }));
    intervalRef.current = intervalRef.current || 5;
    runGenerate();
  }, [runGenerate]);

  const setIntervalMins = useCallback((mins: number | null) => {
    setLoopState(prev => ({ ...prev, interval: mins }));
    intervalRef.current = mins;
  }, []);

  const setAllCitiesVal = useCallback((val: boolean) => {
    setLoopState(prev => ({ ...prev, allCities: val }));
    allCitiesRef.current = val;
  }, []);

  const clearLog = useCallback(() => {
    setLoopState(prev => ({ ...prev, progressLog: [], cyclesCompleted: 0, totalFound: 0, totalNewCreated: 0 }));
  }, []);

  return (
    <YelpLoopContext.Provider value={{
      loopState,
      setInterval: setIntervalMins,
      setAllCities: setAllCitiesVal,
      startLoop,
      stopLoop,
      runOnce,
      clearLog,
      targetSearchTerms: TARGET_SEARCH_TERMS,
    }}>
      {children}
    </YelpLoopContext.Provider>
  );
}

export function useYelpLoop() {
  const ctx = useContext(YelpLoopContext);
  if (!ctx) throw new Error('useYelpLoop must be inside YelpLoopProvider');
  return ctx;
}
