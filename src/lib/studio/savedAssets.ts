/**
 * Save / delete arbitrary generated URLs (images or videos) into the
 * studio_assets library. URLs are referenced — we do NOT re-upload bytes.
 * Deleting removes the library row (and storage_path if we own one).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// url -> asset row id (or null = known-not-saved)
const cache = new Map<string, string | null>();
const listeners = new Set<(url: string) => void>();
function emit(url: string) { listeners.forEach((fn) => fn(url)); }

export interface SaveAssetMeta {
  name?: string;
  notes?: string;
  projectId?: string | null;
  subprojectId?: string | null;
}

export function useSavedAsset(url: string | undefined | null, meta: SaveAssetMeta = {}) {
  const { toast } = useToast();
  const [assetId, setAssetId] = useState<string | null>(url ? cache.get(url) ?? null : null);
  const [busy, setBusy] = useState(false);

  // Initial lookup
  useEffect(() => {
    if (!url) return;
    if (cache.has(url)) { setAssetId(cache.get(url) ?? null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('studio_assets')
        .select('id')
        .eq('image_url', url)
        .maybeSingle();
      const id = data?.id ?? null;
      cache.set(url, id);
      if (!cancelled) setAssetId(id);
    })();
    return () => { cancelled = true; };
  }, [url]);

  // Cross-component sync
  useEffect(() => {
    if (!url) return;
    const fn = (u: string) => { if (u === url) setAssetId(cache.get(url) ?? null); };
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, [url]);

  const save = useCallback(async () => {
    if (!url || busy) return;
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Sign in to save assets');
      const { data, error } = await supabase
        .from('studio_assets')
        .insert({
          user_id: auth.user.id,
          image_url: url,
          name: meta.name || 'Saved asset',
          notes: meta.notes ?? null,
          project_id: meta.projectId ?? null,
          subproject_id: meta.subprojectId ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      cache.set(url, data.id);
      setAssetId(data.id);
      emit(url);
      toast({ title: 'Saved to library' });
    } catch (e) {
      toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }, [url, busy, meta.name, meta.notes, meta.projectId, meta.subprojectId, toast]);

  const remove = useCallback(async () => {
    if (!url || busy) return;
    const id = cache.get(url) ?? assetId;
    if (!id) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('studio_assets').delete().eq('id', id);
      if (error) throw error;
      cache.set(url, null);
      setAssetId(null);
      emit(url);
      toast({ title: 'Removed from library' });
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }, [url, busy, assetId, toast]);

  const toggle = useCallback(() => (assetId ? remove() : save()), [assetId, remove, save]);

  return { saved: !!assetId, busy, save, remove, toggle };
}
