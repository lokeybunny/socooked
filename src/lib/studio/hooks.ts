import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { GenerationJob, WorkerHealth } from './types';

const JOB_SELECT = 'id,user_id,task_type,prompt,negative_prompt,settings_json,input_image_url,input_audio_url,output_video_url,output_thumbnail_url,status,progress,worker_job_id,backend_logs,error_message,created_at,updated_at';

let jobsCache: GenerationJob[] = [];
let jobsLoaded = false;
let lastJobsFetchAt = 0;
let jobsFetchPromise: Promise<void> | null = null;
let jobsChannel: ReturnType<typeof supabase.channel> | null = null;
const jobListeners = new Set<() => void>();

const notifyJobListeners = () => jobListeners.forEach(listener => listener());

const sortJobs = (jobs: GenerationJob[]) =>
  [...jobs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

async function fetchStudioJobs(force = false) {
  if (jobsFetchPromise) return jobsFetchPromise;
  if (!force && jobsLoaded && Date.now() - lastJobsFetchAt < 15_000) return;

  jobsFetchPromise = (async () => {
    const { data, error } = await supabase
      .from('generation_jobs')
      .select(JOB_SELECT)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error) {
      jobsCache = (data as unknown as GenerationJob[]) || [];
      lastJobsFetchAt = Date.now();
    } else {
      console.error('Failed to fetch studio jobs:', error.message);
    }
    jobsLoaded = true;
    notifyJobListeners();
  })().finally(() => {
    jobsFetchPromise = null;
  });

  return jobsFetchPromise;
}

function ensureJobsRealtime() {
  if (jobsChannel) return;

  jobsChannel = supabase
    .channel('studio-jobs-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'generation_jobs' }, payload => {
      if (payload.eventType === 'DELETE') {
        const oldJob = payload.old as Pick<GenerationJob, 'id'>;
        jobsCache = jobsCache.filter(job => job.id !== oldJob.id);
      } else {
        const nextJob = payload.new as GenerationJob;
        jobsCache = sortJobs([
          nextJob,
          ...jobsCache.filter(job => job.id !== nextJob.id),
        ]).slice(0, 100);
      }
      notifyJobListeners();
    })
    .subscribe();
}

export function useStudioJobs() {
  const [jobs, setJobs] = useState<GenerationJob[]>(jobsCache);
  const [loading, setLoading] = useState(!jobsLoaded);

  const refetch = useCallback(async () => {
    await fetchStudioJobs(true);
    setJobs(jobsCache);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const listener = () => {
      if (active) {
        setJobs(jobsCache);
        setLoading(false);
      }
    };

    jobListeners.add(listener);
    ensureJobsRealtime();
    fetchStudioJobs(!jobsLoaded).finally(listener);

    return () => {
      active = false;
      jobListeners.delete(listener);
    };
  }, []);

  return { jobs, loading, refetch };
}

export function useWorkerHealth() {
  const [health, setHealth] = useState<WorkerHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/studio-health`,
          { headers: { 'Content-Type': 'application/json' } }
        );
        const data = await res.json();
        setHealth(data);
      } catch {
        setHealth({ online: false, message: 'Failed to check', supported_modes: [], queue_depth: 0, last_success: null, hardware_tier: 'unknown' });
      }
      setLoading(false);
    };
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, []);

  return { health, loading };
}

export async function submitJob(payload: {
  task_type: string;
  prompt: string;
  negative_prompt?: string;
  settings_json?: Record<string, unknown>;
  input_image_url?: string;
  input_audio_url?: string;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/studio-orchestrator`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to submit job');
  }

  return res.json();
}

export async function cancelJob(jobId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/studio-orchestrator/cancel/${jobId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to cancel');
  }
}

export async function retryJob(jobId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/studio-orchestrator/retry/${jobId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to retry');
  }
}
