import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { submitJob } from './hooks';
import type { TaskType } from './types';

export interface StudioBatch {
  id: string;
  user_id: string;
  project_id: string | null;
  subproject_id: string | null;
  name: string;
  status: 'draft' | 'running' | 'completed' | 'partial' | 'failed';
  total_items: number;
  completed_items: number;
  failed_items: number;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudioBatchItem {
  id: string;
  batch_id: string;
  user_id: string;
  task_type: TaskType;
  prompt: string;
  negative_prompt: string | null;
  settings_json: Record<string, unknown>;
  input_image_url: string | null;
  input_audio_url: string | null;
  position: number;
  status: 'queued' | 'submitted' | 'failed';
  generation_job_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface BatchPayload {
  task_type: TaskType;
  prompt: string;
  negative_prompt?: string;
  settings_json?: Record<string, unknown>;
  input_image_url?: string;
  input_audio_url?: string;
}

async function getUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  return session.user.id;
}

function defaultBatchName(projectName?: string | null, subprojectName?: string | null) {
  const stamp = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (projectName && subprojectName) return `${projectName} · ${subprojectName} — ${stamp}`;
  if (projectName) return `${projectName} — ${stamp}`;
  return `Batch — ${stamp}`;
}

/** Returns the active draft batch for the user+scope, creating one if missing. */
export async function getOrCreateActiveBatch(opts: {
  projectId: string | null;
  subprojectId: string | null;
  projectName?: string | null;
  subprojectName?: string | null;
}): Promise<StudioBatch> {
  const userId = await getUserId();
  let q = supabase
    .from('studio_batches')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1);

  q = opts.projectId ? q.eq('project_id', opts.projectId) : q.is('project_id', null);
  q = opts.subprojectId ? q.eq('subproject_id', opts.subprojectId) : q.is('subproject_id', null);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  if (data && data.length > 0) return data[0] as unknown as StudioBatch;

  const { data: created, error: insErr } = await supabase
    .from('studio_batches')
    .insert({
      user_id: userId,
      project_id: opts.projectId,
      subproject_id: opts.subprojectId,
      name: defaultBatchName(opts.projectName, opts.subprojectName),
      status: 'draft',
    })
    .select()
    .single();
  if (insErr) throw new Error(insErr.message);
  return created as unknown as StudioBatch;
}

export async function addItemToBatch(batchId: string, payload: BatchPayload): Promise<StudioBatchItem> {
  const userId = await getUserId();
  const { count } = await supabase
    .from('studio_batch_items')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId);
  const position = count ?? 0;

  const { data, error } = await supabase
    .from('studio_batch_items')
    .insert({
      batch_id: batchId,
      user_id: userId,
      task_type: payload.task_type,
      prompt: payload.prompt,
      negative_prompt: payload.negative_prompt ?? null,
      settings_json: (payload.settings_json ?? {}) as never,
      input_image_url: payload.input_image_url ?? null,
      input_audio_url: payload.input_audio_url ?? null,
      position,
      status: 'queued',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // bump total_items
  await supabase.rpc('noop' as never).catch(() => {});
  await supabase
    .from('studio_batches')
    .update({ total_items: position + 1 })
    .eq('id', batchId);

  return data as unknown as StudioBatchItem;
}

export async function removeBatchItem(itemId: string, batchId: string) {
  const { error } = await supabase.from('studio_batch_items').delete().eq('id', itemId);
  if (error) throw new Error(error.message);
  const { count } = await supabase
    .from('studio_batch_items')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId);
  await supabase.from('studio_batches').update({ total_items: count ?? 0 }).eq('id', batchId);
}

export async function clearBatch(batchId: string) {
  const { error } = await supabase.from('studio_batch_items').delete().eq('batch_id', batchId);
  if (error) throw new Error(error.message);
  await supabase.from('studio_batches').update({ total_items: 0, completed_items: 0, failed_items: 0 }).eq('id', batchId);
}

export async function renameBatch(batchId: string, name: string) {
  await supabase.from('studio_batches').update({ name }).eq('id', batchId);
}

/** Fire every queued item in parallel. Failures don't stop other items. */
export async function runBatch(
  batchId: string,
  projectId: string | null,
  subprojectId: string | null,
): Promise<{ completed: number; failed: number }> {
  const { data: items, error } = await supabase
    .from('studio_batch_items')
    .select('*')
    .eq('batch_id', batchId)
    .eq('status', 'queued')
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  const queue = (items || []) as unknown as StudioBatchItem[];
  if (!queue.length) return { completed: 0, failed: 0 };

  await supabase
    .from('studio_batches')
    .update({ status: 'running', submitted_at: new Date().toISOString() })
    .eq('id', batchId);

  const results = await Promise.allSettled(
    queue.map(async (item) => {
      const resp = await submitJob({
        task_type: item.task_type,
        prompt: item.prompt,
        negative_prompt: item.negative_prompt || undefined,
        settings_json: { ...(item.settings_json || {}), batch_id: batchId },
        input_image_url: item.input_image_url || undefined,
        input_audio_url: item.input_audio_url || undefined,
        project_id: projectId,
        subproject_id: subprojectId,
      });
      const jobId = (resp as { job_id?: string; id?: string })?.job_id || (resp as { id?: string })?.id || null;
      await supabase
        .from('studio_batch_items')
        .update({ status: 'submitted', generation_job_id: jobId, error_message: null })
        .eq('id', item.id);
      if (jobId) {
        await supabase.from('generation_jobs').update({ batch_id: batchId }).eq('id', jobId);
      }
      return jobId;
    }),
  );

  let completed = 0;
  let failed = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      completed++;
    } else {
      failed++;
      await supabase
        .from('studio_batch_items')
        .update({ status: 'failed', error_message: String((r as PromiseRejectedResult).reason?.message || r.reason || 'Unknown error') })
        .eq('id', queue[i].id);
    }
  }

  const finalStatus = failed === 0 ? 'completed' : completed === 0 ? 'failed' : 'partial';
  await supabase
    .from('studio_batches')
    .update({ status: finalStatus, completed_items: completed, failed_items: failed })
    .eq('id', batchId);

  return { completed, failed };
}

/** Realtime hook for one batch + its items. */
export function useBatch(batchId: string | null) {
  const [batch, setBatch] = useState<StudioBatch | null>(null);
  const [items, setItems] = useState<StudioBatchItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!batchId) { setBatch(null); setItems([]); return; }
    setLoading(true);
    const [{ data: b }, { data: i }] = await Promise.all([
      supabase.from('studio_batches').select('*').eq('id', batchId).maybeSingle(),
      supabase.from('studio_batch_items').select('*').eq('batch_id', batchId).order('position', { ascending: true }),
    ]);
    setBatch((b as unknown as StudioBatch) || null);
    setItems((i as unknown as StudioBatchItem[]) || []);
    setLoading(false);
  }, [batchId]);

  useEffect(() => { refetch(); }, [refetch]);

  useEffect(() => {
    if (!batchId) return;
    const ch = supabase
      .channel(`studio-batch-${batchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_batches', filter: `id=eq.${batchId}` }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_batch_items', filter: `batch_id=eq.${batchId}` }, refetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [batchId, refetch]);

  return { batch, items, loading, refetch };
}

/** Lists all completed/partial/failed batches for the library grouping. */
export function useUserBatches(scope?: { projectId?: string | null; subprojectId?: string | null }) {
  const [batches, setBatches] = useState<StudioBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('studio_batches').select('*').order('created_at', { ascending: false }).limit(50);
    if (scope?.projectId) q = q.eq('project_id', scope.projectId);
    if (scope?.subprojectId) q = q.eq('subproject_id', scope.subprojectId);
    const { data } = await q;
    setBatches((data as unknown as StudioBatch[]) || []);
    setLoading(false);
  }, [scope?.projectId, scope?.subprojectId]);

  useEffect(() => { refetch(); }, [refetch]);
  return { batches, loading, refetch };
}
