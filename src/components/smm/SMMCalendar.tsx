import { useState, useMemo } from 'react';
import type { ScheduledPost } from '@/lib/smm/types';
import { smmApi } from '@/lib/smm/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, startOfWeek, endOfWeek, isSameMonth, isSameDay } from 'date-fns';
import { toast } from 'sonner';

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-primary/80', queued: 'bg-amber-500/80', completed: 'bg-emerald-500/80',
  failed: 'bg-destructive/80', pending: 'bg-muted-foreground/60', in_progress: 'bg-amber-400/80',
  cancelled: 'bg-muted-foreground/40',
};

export default function SMMCalendar({ posts, onRefresh }: { posts: ScheduledPost[]; onRefresh: () => void }) {
  const [current, setCurrent] = useState(new Date());
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const scheduledPosts = useMemo(() => posts.filter(p => p.scheduled_date && (p.status === 'scheduled' || p.status === 'queued')), [posts]);

  const getPostsForDay = (day: Date) => scheduledPosts.filter(p => p.scheduled_date && isSameDay(new Date(p.scheduled_date), day));

  const openDetail = (post: ScheduledPost) => {
    setSelectedPost(post);
    setEditTitle(post.title);
    const dt = post.scheduled_date ? new Date(post.scheduled_date) : new Date();
    setEditDate(format(dt, 'yyyy-MM-dd'));
    setEditTime(format(dt, 'HH:mm'));
  };

  const handleSave = async () => {
    if (!selectedPost) return;
    await smmApi.updatePost(selectedPost.id, {
      title: editTitle,
      scheduled_date: new Date(`${editDate}T${editTime}`).toISOString(),
    });
    toast.success('Post updated');
    setSelectedPost(null);
    onRefresh();
  };

  const handleCancel = async () => {
    if (!selectedPost) return;
    await smmApi.cancelPost(selectedPost.id);
    toast.success('Post cancelled');
    setSelectedPost(null);
    onRefresh();
  };

  const handleDrop = async (day: Date) => {
    if (!dragId) return;
    const post = posts.find(p => p.id === dragId);
    if (!post?.scheduled_date) return;
    const oldDate = new Date(post.scheduled_date);
    const newDate = new Date(day);
    newDate.setHours(oldDate.getHours(), oldDate.getMinutes());
    await smmApi.updatePost(dragId, { scheduled_date: newDate.toISOString() });
    setDragId(null);
    toast.success('Post rescheduled');
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">{format(current, 'MMMM yyyy')}</h3>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrent(subMonths(current, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrent(new Date())}>Today</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrent(addMonths(current, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
        {days.map(day => {
          const dayPosts = getPostsForDay(day);
          const isToday = isSameDay(day, new Date());
          return (
            <div key={day.toISOString()}
              className={`bg-card min-h-[80px] p-1.5 ${!isSameMonth(day, current) ? 'opacity-40' : ''}`}
              onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(day)}>
              <p className={`text-xs font-medium mb-1 ${isToday ? 'text-primary font-bold' : 'text-foreground'}`}>{format(day, 'd')}</p>
              <div className="space-y-0.5">
                {dayPosts.slice(0, 3).map(p => (
                  <button key={p.id} draggable onDragStart={() => setDragId(p.id)}
                    onClick={() => openDetail(p)}
                    className={`w-full text-left text-[10px] text-white px-1.5 py-0.5 rounded truncate ${STATUS_COLORS[p.status] || 'bg-muted'}`}>
                    {p.title}
                  </button>
                ))}
                {dayPosts.length > 3 && <p className="text-[10px] text-muted-foreground">+{dayPosts.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>

      <Sheet open={!!selectedPost} onOpenChange={v => !v && setSelectedPost(null)}>
        <SheetContent>
          {selectedPost && (
            <>
              <SheetHeader><SheetTitle>Post Details</SheetTitle></SheetHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Job ID</p>
                  <p className="text-sm font-mono text-foreground">{selectedPost.job_id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Platforms</p>
                  <div className="flex gap-1 flex-wrap">
                    {selectedPost.platforms.map(p => <span key={p} className="px-2 py-0.5 bg-muted rounded-full text-xs">{p}</span>)}
                  </div>
                </div>
                <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Title" />
                <div className="flex gap-2">
                  <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="flex-1" />
                  <Input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className="w-32" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} className="flex-1">Save Changes</Button>
                  <Button variant="destructive" onClick={handleCancel}>Cancel Post</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
