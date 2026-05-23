import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Pin, PinOff, Trash2, StickyNote, Save } from 'lucide-react';

interface Note {
  id: string;
  user_id: string;
  project_id: string | null;
  subproject_id: string | null;
  title: string | null;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface Props {
  projectId: string | null;
  subprojectId: string | null;
}

export function StudioNotes({ projectId, subprojectId }: Props) {
  const { toast } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { title: string; content: string }>>({});

  const load = useCallback(async () => {
    if (!subprojectId) {
      setNotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('studio_notes')
      .select('*')
      .eq('subproject_id', subprojectId)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load notes', description: error.message, variant: 'destructive' });
    } else {
      const list = (data || []) as Note[];
      setNotes(list);
      setDrafts(Object.fromEntries(list.map(n => [n.id, { title: n.title || '', content: n.content || '' }])));
    }
    setLoading(false);
  }, [subprojectId, toast]);

  useEffect(() => { load(); }, [load]);

  const createNote = async () => {
    if (!subprojectId) return;
    setCreating(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setCreating(false); return; }
    const { data, error } = await supabase.from('studio_notes').insert({
      user_id: auth.user.id,
      project_id: projectId,
      subproject_id: subprojectId,
      title: '',
      content: '',
    }).select().single();
    setCreating(false);
    if (error) {
      toast({ title: 'Could not create note', description: error.message, variant: 'destructive' });
      return;
    }
    setNotes(prev => [data as Note, ...prev]);
    setDrafts(prev => ({ ...prev, [data.id]: { title: '', content: '' } }));
  };

  const saveNote = async (id: string) => {
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    const { error } = await supabase.from('studio_notes')
      .update({ title: d.title, content: d.content })
      .eq('id', id);
    setSavingId(null);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    setNotes(prev => prev.map(n => n.id === id ? { ...n, title: d.title, content: d.content } : n));
    toast({ title: 'Saved' });
  };

  const togglePin = async (n: Note) => {
    const { error } = await supabase.from('studio_notes').update({ pinned: !n.pinned }).eq('id', n.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    load();
  };

  const deleteNote = async (id: string) => {
    if (!confirm('Delete this note?')) return;
    const { error } = await supabase.from('studio_notes').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  if (!subprojectId) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <StickyNote className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">Select a project and subproject to view its notes.</p>
        <p className="text-xs mt-1 opacity-70">Notes are scoped per subproject.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Notes</h2>
          <p className="text-xs text-muted-foreground">Notes for this subproject only.</p>
        </div>
        <Button onClick={createNote} disabled={creating} size="sm">
          {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
          New Note
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : notes.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">No notes yet. Click "New Note" to add one.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {notes.map(n => {
            const d = drafts[n.id] || { title: n.title || '', content: n.content || '' };
            const dirty = d.title !== (n.title || '') || d.content !== (n.content || '');
            return (
              <div key={n.id} className={`glass-card p-4 space-y-3 ${n.pinned ? 'ring-1 ring-amber-400/40' : ''}`}>
                <div className="flex items-center gap-2">
                  <Input
                    value={d.title}
                    placeholder="Title"
                    onChange={(e) => setDrafts(p => ({ ...p, [n.id]: { ...d, title: e.target.value } }))}
                    className="flex-1 h-8 text-sm font-medium"
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => togglePin(n)} title={n.pinned ? 'Unpin' : 'Pin'}>
                    {n.pinned ? <Pin className="w-4 h-4 text-amber-400" /> : <PinOff className="w-4 h-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteNote(n.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <Textarea
                  value={d.content}
                  placeholder="Write your note..."
                  onChange={(e) => setDrafts(p => ({ ...p, [n.id]: { ...d, content: e.target.value } }))}
                  className="min-h-[160px] text-sm"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Updated {new Date(n.updated_at).toLocaleString()}</span>
                  <Button size="sm" disabled={!dirty || savingId === n.id} onClick={() => saveNote(n.id)}>
                    {savingId === n.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                    Save
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
