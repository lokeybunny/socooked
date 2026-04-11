import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, GripVertical, Trash2, Eye, EyeOff, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  position: number;
  is_published: boolean;
  duration_label: string | null;
}

export default function CourseAdmin() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', video_url: '', description: '', duration_label: '' });

  const { data: lessons, isLoading } = useQuery({
    queryKey: ['admin-course-lessons'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_lessons')
        .select('*')
        .order('position', { ascending: true });
      if (error) throw error;
      return data as Lesson[];
    },
  });

  const addLesson = useMutation({
    mutationFn: async () => {
      if (!form.title.trim() || !form.video_url.trim()) throw new Error('Title and video URL required');
      const nextPos = (lessons?.length ?? 0);
      const { error } = await supabase.from('course_lessons').insert({
        title: form.title.trim(),
        video_url: form.video_url.trim(),
        description: form.description.trim() || null,
        duration_label: form.duration_label.trim() || null,
        position: nextPos,
        is_published: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-course-lessons'] });
      setForm({ title: '', video_url: '', description: '', duration_label: '' });
      toast.success('Lesson added');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateLesson = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Lesson> }) => {
      const { error } = await supabase.from('course_lessons').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-course-lessons'] });
      toast.success('Saved');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteLesson = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('course_lessons').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-course-lessons'] });
      toast.success('Deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const moveLesson = async (id: string, dir: -1 | 1) => {
    if (!lessons) return;
    const idx = lessons.findIndex(l => l.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= lessons.length) return;

    await Promise.all([
      supabase.from('course_lessons').update({ position: swapIdx }).eq('id', lessons[idx].id),
      supabase.from('course_lessons').update({ position: idx }).eq('id', lessons[swapIdx].id),
    ]);
    qc.invalidateQueries({ queryKey: ['admin-course-lessons'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Course Lessons</h2>
        <span className="text-xs text-muted-foreground">{lessons?.length ?? 0} lessons</span>
      </div>

      {/* Add new lesson form */}
      <div className="p-4 rounded-xl border bg-muted/30 space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-2"><Plus className="h-4 w-4" /> Add Lesson</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input placeholder="Lesson title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <Input placeholder="Video URL (YouTube/Vimeo embed)" value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} />
          <Input placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <Input placeholder="Duration label (e.g. 15 min)" value={form.duration_label} onChange={e => setForm(f => ({ ...f, duration_label: e.target.value }))} />
        </div>
        <Button size="sm" onClick={() => addLesson.mutate()} disabled={addLesson.isPending || !form.title || !form.video_url}>
          {addLesson.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
          Add Lesson
        </Button>
      </div>

      {/* Lessons list */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !lessons?.length ? (
        <p className="text-sm text-muted-foreground text-center py-8">No lessons yet. Add your first one above.</p>
      ) : (
        <div className="space-y-2">
          {lessons.map((lesson, idx) => (
            <div key={lesson.id} className="flex items-start gap-3 p-3 rounded-xl border bg-background group">
              {/* Reorder */}
              <div className="flex flex-col gap-0.5 pt-1">
                <button onClick={() => moveLesson(lesson.id, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-xs">▲</button>
                <button onClick={() => moveLesson(lesson.id, 1)} disabled={idx === lessons.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-xs">▼</button>
              </div>

              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold mt-0.5">
                {idx + 1}
              </span>

              {editing === lesson.id ? (
                <EditRow
                  lesson={lesson}
                  onSave={(updates) => {
                    updateLesson.mutate({ id: lesson.id, updates });
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{lesson.title}</span>
                    {lesson.duration_label && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{lesson.duration_label}</span>}
                    {!lesson.is_published && <span className="text-[10px] text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded">Draft</span>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{lesson.video_url}</p>
                </div>
              )}

              {editing !== lesson.id && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => setEditing(lesson.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit">
                    <Save className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => updateLesson.mutate({ id: lesson.id, updates: { is_published: !lesson.is_published } })}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title={lesson.is_published ? 'Unpublish' : 'Publish'}
                  >
                    {lesson.is_published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => { if (confirm('Delete this lesson?')) deleteLesson.mutate(lesson.id); }} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditRow({ lesson, onSave, onCancel }: { lesson: Lesson; onSave: (u: Partial<Lesson>) => void; onCancel: () => void }) {
  const [f, setF] = useState({
    title: lesson.title,
    video_url: lesson.video_url,
    description: lesson.description || '',
    duration_label: lesson.duration_label || '',
  });

  return (
    <div className="flex-1 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input size={1} value={f.title} onChange={e => setF(v => ({ ...v, title: e.target.value }))} placeholder="Title" />
        <Input size={1} value={f.video_url} onChange={e => setF(v => ({ ...v, video_url: e.target.value }))} placeholder="Video URL" />
        <Input size={1} value={f.description} onChange={e => setF(v => ({ ...v, description: e.target.value }))} placeholder="Description" />
        <Input size={1} value={f.duration_label} onChange={e => setF(v => ({ ...v, duration_label: e.target.value }))} placeholder="Duration" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="default" onClick={() => onSave({ title: f.title, video_url: f.video_url, description: f.description || null, duration_label: f.duration_label || null })}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
