import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { GenerationJob, WorkerHealth } from './types';

export function useStudioJobs() {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = async () => {
    const { data } = await supabase
      .from('generation_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setJobs((data as unknown as GenerationJob[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchJobs();

    const channel = supabase
      .channel('studio-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'generation_jobs' }, () => {
        fetchJobs();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { jobs, loading, refetch: fetchJobs };
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
