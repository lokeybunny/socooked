import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { GenerationJob, StudioProject, StudioSubproject, WorkerHealth } from './types';

const JOB_SELECT = 'id,user_id,task_type,prompt,negative_prompt,settings_json,input_image_url,input_audio_url,output_video_url,output_thumbnail_url,status,progress,worker_job_id,backend_logs,error_message,created_at,updated_at,project_id,subproject_id';

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
  project_id?: string | null;
  subproject_id?: string | null;
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

// ============ Projects ============
let projectsCache: StudioProject[] = [];
let projectsLoaded = false;
let projectsFetchPromise: Promise<void> | null = null;
const projectListeners = new Set<() => void>();
const notifyProjectListeners = () => projectListeners.forEach(l => l());

async function fetchStudioProjects(force = false) {
  if (projectsFetchPromise) return projectsFetchPromise;
  if (!force && projectsLoaded) return;
  projectsFetchPromise = (async () => {
    const { data, error } = await supabase
      .from('studio_projects')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) projectsCache = (data as unknown as StudioProject[]) || [];
    else console.error('Failed to fetch projects:', error.message);
    projectsLoaded = true;
    notifyProjectListeners();
  })().finally(() => { projectsFetchPromise = null; });
  return projectsFetchPromise;
}

export function useStudioProjects() {
  const [projects, setProjects] = useState<StudioProject[]>(projectsCache);
  const [loading, setLoading] = useState(!projectsLoaded);

  const refetch = useCallback(async () => {
    await fetchStudioProjects(true);
    setProjects(projectsCache);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const listener = () => {
      if (active) { setProjects(projectsCache); setLoading(false); }
    };
    projectListeners.add(listener);
    fetchStudioProjects(!projectsLoaded).finally(listener);
    return () => { active = false; projectListeners.delete(listener); };
  }, []);

  return { projects, loading, refetch };
}

export async function createStudioProject(input: { name: string; kind?: string | null; description?: string | null }) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('studio_projects')
    .insert({ user_id: userId, name: input.name, kind: input.kind ?? null, description: input.description ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  projectsCache = [data as unknown as StudioProject, ...projectsCache];
  notifyProjectListeners();
  return data as unknown as StudioProject;
}

export async function deleteStudioProject(id: string) {
  const { error } = await supabase.from('studio_projects').delete().eq('id', id);
  if (error) throw new Error(error.message);
  projectsCache = projectsCache.filter(p => p.id !== id);
  notifyProjectListeners();
}

// ============ Subprojects ============
const subprojectsCache = new Map<string, StudioSubproject[]>();
const subprojectsLoaded = new Set<string>();
const subprojectListeners = new Map<string, Set<() => void>>();

function notifySubListeners(projectId: string) {
  subprojectListeners.get(projectId)?.forEach(l => l());
}

async function fetchStudioSubprojects(projectId: string, force = false) {
  if (!force && subprojectsLoaded.has(projectId)) return;
  const { data, error } = await supabase
    .from('studio_subprojects')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (!error) subprojectsCache.set(projectId, (data as unknown as StudioSubproject[]) || []);
  else console.error('Failed to fetch subprojects:', error.message);
  subprojectsLoaded.add(projectId);
  notifySubListeners(projectId);
}

export function useStudioSubprojects(projectId: string | null) {
  const [subprojects, setSubprojects] = useState<StudioSubproject[]>(
    projectId ? subprojectsCache.get(projectId) || [] : []
  );
  const [loading, setLoading] = useState(!!projectId && !subprojectsLoaded.has(projectId));

  const refetch = useCallback(async () => {
    if (!projectId) return;
    await fetchStudioSubprojects(projectId, true);
    setSubprojects(subprojectsCache.get(projectId) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setSubprojects([]);
      setLoading(false);
      return;
    }
    let active = true;
    const listener = () => {
      if (active) {
        setSubprojects(subprojectsCache.get(projectId) || []);
        setLoading(false);
      }
    };
    if (!subprojectListeners.has(projectId)) subprojectListeners.set(projectId, new Set());
    subprojectListeners.get(projectId)!.add(listener);
    fetchStudioSubprojects(projectId, !subprojectsLoaded.has(projectId)).finally(listener);
    return () => {
      active = false;
      subprojectListeners.get(projectId)?.delete(listener);
    };
  }, [projectId]);

  return { subprojects, loading, refetch };
}

export async function createStudioSubproject(input: {
  project_id: string;
  name: string;
  description?: string | null;
  color?: string | null;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('studio_subprojects')
    .insert({
      user_id: userId,
      project_id: input.project_id,
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const row = data as unknown as StudioSubproject;
  const existing = subprojectsCache.get(input.project_id) || [];
  subprojectsCache.set(input.project_id, [row, ...existing]);
  notifySubListeners(input.project_id);
  return row;
}

export async function deleteStudioSubproject(id: string, projectId: string) {
  const { error } = await supabase.from('studio_subprojects').delete().eq('id', id);
  if (error) throw new Error(error.message);
  const existing = subprojectsCache.get(projectId) || [];
  subprojectsCache.set(projectId, existing.filter(s => s.id !== id));
  notifySubListeners(projectId);
}
