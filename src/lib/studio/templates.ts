import { supabase } from '@/integrations/supabase/client';

export interface StudioTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  snapshot: TemplateSnapshot;
  created_at: string;
  updated_at: string;
}

export interface TemplateSnapshot {
  taskType?: string;
  prompt?: string;
  negPrompt?: string;
  settings?: Record<string, any>;
  selectedStyles?: string[];
  useSeedance?: boolean;
  noMusic?: boolean;
  propertyLock?: boolean;
  imagePreview?: string | null;
  imagePreviewB?: string | null;
  refImageUrls?: string[];
  returnLastFrame?: boolean;
  directorStyleIds?: string[];
  director?: { subject: string; action: string; scene: string; camera: string; lighting: string; tone: string };
}

// Event channel between TemplatesDrawer <-> StudioCreate
export const TPL_EVT = {
  REQUEST_SNAPSHOT: 'studio:template:request-snapshot',
  SNAPSHOT_READY: 'studio:template:snapshot-ready',
  APPLY: 'studio:template:apply',
} as const;

export function requestSnapshot(): Promise<TemplateSnapshot | null> {
  return new Promise((resolve) => {
    const handler = (e: Event) => {
      window.removeEventListener(TPL_EVT.SNAPSHOT_READY, handler);
      resolve(((e as CustomEvent).detail as TemplateSnapshot) ?? null);
    };
    window.addEventListener(TPL_EVT.SNAPSHOT_READY, handler);
    window.dispatchEvent(new CustomEvent(TPL_EVT.REQUEST_SNAPSHOT));
    setTimeout(() => {
      window.removeEventListener(TPL_EVT.SNAPSHOT_READY, handler);
      resolve(null);
    }, 1500);
  });
}

export function applyTemplate(snapshot: TemplateSnapshot) {
  window.dispatchEvent(new CustomEvent(TPL_EVT.APPLY, { detail: snapshot }));
}

export async function listTemplates(): Promise<StudioTemplate[]> {
  const { data, error } = await supabase
    .from('studio_templates' as any)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as StudioTemplate[];
}

export async function saveTemplate(name: string, snapshot: TemplateSnapshot, description?: string): Promise<StudioTemplate> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');
  const cover_url = snapshot.imagePreview || snapshot.refImageUrls?.[0] || null;
  const { data, error } = await supabase
    .from('studio_templates' as any)
    .insert({
      user_id: u.user.id,
      name,
      description: description || null,
      cover_url,
      snapshot: snapshot as any,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as StudioTemplate;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('studio_templates' as any).delete().eq('id', id);
  if (error) throw error;
}

export async function renameTemplate(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('studio_templates' as any)
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
