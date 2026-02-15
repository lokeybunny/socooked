import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tag, Calendar, User, Paperclip, MessageSquare, CheckSquare, Plus, ExternalLink, Trash2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  cardId: string;
  boardId: string;
  labels: { id: string; name: string; color: string | null }[];
  onClose: () => void;
  onUpdate: () => void;
}

export function CardDetailModal({ cardId, boardId, labels, onClose, onUpdate }: Props) {
  const { user } = useAuth();
  const [card, setCard] = useState<any>(null);
  const [cardLabels, setCardLabels] = useState<string[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newCheckTitle, setNewCheckTitle] = useState('');
  const [newItemContent, setNewItemContent] = useState<Record<string, string>>({});
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [newAttUrl, setNewAttUrl] = useState('');

  const load = async () => {
    const [cardRes, clRes, commRes, checkRes, attRes] = await Promise.all([
      supabase.from('cards').select('*').eq('id', cardId).single(),
      supabase.from('card_labels').select('label_id').eq('card_id', cardId),
      supabase.from('card_comments').select('*, profiles:author_id(full_name)').eq('card_id', cardId).order('created_at'),
      supabase.from('checklists').select('*, checklist_items(*)').eq('card_id', cardId).order('created_at'),
      supabase.from('card_attachments').select('*').eq('card_id', cardId).order('created_at'),
    ]);
    setCard(cardRes.data);
    setEditTitle(cardRes.data?.title || '');
    setEditDesc(cardRes.data?.description || '');
    setCardLabels((clRes.data || []).map((cl: any) => cl.label_id));
    setComments(commRes.data || []);
    setChecklists((checkRes.data || []).map((c: any) => ({
      ...c,
      checklist_items: (c.checklist_items || []).sort((a: any, b: any) => a.position - b.position),
    })));
    setAttachments(attRes.data || []);
  };

  useEffect(() => { load(); }, [cardId]);

  const saveCard = async (updates: Record<string, unknown>) => {
    await supabase.from('cards').update(updates).eq('id', cardId);
    onUpdate();
    load();
  };

  const toggleLabel = async (labelId: string) => {
    if (cardLabels.includes(labelId)) {
      await supabase.from('card_labels').delete().eq('card_id', cardId).eq('label_id', labelId);
    } else {
      await supabase.from('card_labels').insert({ card_id: cardId, label_id: labelId });
    }
    onUpdate();
    load();
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    await supabase.from('card_comments').insert({ card_id: cardId, author_id: user?.id, body: newComment.trim() });
    setNewComment('');
    load();
  };

  const addChecklist = async () => {
    const title = newCheckTitle.trim() || 'Checklist';
    await supabase.from('checklists').insert({ card_id: cardId, title });
    setNewCheckTitle('');
    load();
  };

  const addCheckItem = async (checklistId: string) => {
    const content = (newItemContent[checklistId] || '').trim();
    if (!content) return;
    const items = checklists.find(c => c.id === checklistId)?.checklist_items || [];
    await supabase.from('checklist_items').insert({ checklist_id: checklistId, content, position: items.length });
    setNewItemContent(prev => ({ ...prev, [checklistId]: '' }));
    load();
  };

  const toggleCheckItem = async (itemId: string, isDone: boolean) => {
    await supabase.from('checklist_items').update({ is_done: !isDone }).eq('id', itemId);
    load();
  };

  const addAttachment = async () => {
    if (!newAttUrl.trim()) return;
    await supabase.from('card_attachments').insert({ card_id: cardId, type: 'url', title: newAttUrl.trim(), url: newAttUrl.trim() });
    setNewAttUrl('');
    load();
  };

  const deleteCard = async () => {
    await supabase.from('cards').delete().eq('id', cardId);
    onUpdate();
    onClose();
    toast.success('Card deleted');
  };

  if (!card) return null;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Card Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Title */}
          <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} onBlur={() => editTitle !== card.title && saveCard({ title: editTitle })} className="text-lg font-semibold border-none shadow-none px-0 focus-visible:ring-0" />

          {/* Source badge */}
          {card.source && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono bg-muted px-2 py-1 rounded">{card.source}</span>
              {card.source_url && <a href={card.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />Source</a>}
            </div>
          )}

          {/* Priority + Status + Due date */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <Select value={card.priority} onValueChange={v => saveCard({ priority: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['low','medium','high','urgent'].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={card.status} onValueChange={v => saveCard({ status: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['open','done','archived'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Due Date</Label>
              <Input type="date" value={card.due_date || ''} onChange={e => saveCard({ due_date: e.target.value || null })} className="h-8 text-xs" />
            </div>
          </div>

          {/* Labels */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><Tag className="h-3 w-3" />Labels</Label>
            <div className="flex flex-wrap gap-1.5">
              {labels.map(l => (
                <button key={l.id} onClick={() => toggleLabel(l.id)}
                  className={cn("text-xs px-2 py-1 rounded-full border transition-all", cardLabels.includes(l.id) ? "ring-2 ring-primary/50" : "opacity-60 hover:opacity-100")}
                  style={{ backgroundColor: `${l.color || '#6366f1'}20`, color: l.color || '#6366f1', borderColor: l.color || '#6366f1' }}>
                  {l.name}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} onBlur={() => editDesc !== card.description && saveCard({ description: editDesc })} placeholder="Add a description..." rows={3} className="text-sm" />
          </div>

          {/* Checklists */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><CheckSquare className="h-3 w-3" />Checklists</Label>
              <Button size="sm" variant="ghost" onClick={addChecklist} className="h-6 text-xs"><Plus className="h-3 w-3 mr-1" />Add</Button>
            </div>
            {checklists.map(cl => {
              const total = cl.checklist_items?.length || 0;
              const done = cl.checklist_items?.filter((i: any) => i.is_done).length || 0;
              return (
                <div key={cl.id} className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{cl.title}</span>
                    {total > 0 && <span className="text-xs text-muted-foreground">{done}/{total}</span>}
                  </div>
                  {total > 0 && <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(done/total)*100}%` }} /></div>}
                  {cl.checklist_items?.map((item: any) => (
                    <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={item.is_done} onCheckedChange={() => toggleCheckItem(item.id, item.is_done)} />
                      <span className={cn(item.is_done && "line-through text-muted-foreground")}>{item.content}</span>
                    </label>
                  ))}
                  <div className="flex gap-2">
                    <Input value={newItemContent[cl.id] || ''} onChange={e => setNewItemContent(prev => ({ ...prev, [cl.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addCheckItem(cl.id)} placeholder="Add item..." className="h-7 text-xs" />
                    <Button size="sm" variant="ghost" onClick={() => addCheckItem(cl.id)} className="h-7 text-xs">Add</Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><Paperclip className="h-3 w-3" />Attachments</Label>
            {attachments.map(att => (
              <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                <ExternalLink className="h-3 w-3" />{att.title || att.url}
              </a>
            ))}
            <div className="flex gap-2">
              <Input value={newAttUrl} onChange={e => setNewAttUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAttachment()} placeholder="Paste URL..." className="h-7 text-xs" />
              <Button size="sm" variant="ghost" onClick={addAttachment} className="h-7 text-xs">Add</Button>
            </div>
          </div>

          {/* Comments */}
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><MessageSquare className="h-3 w-3" />Comments ({comments.length})</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {comments.map(c => (
                <div key={c.id} className="bg-muted/50 rounded-lg p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium">{c.profiles?.full_name || 'Bot'}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()} placeholder="Write a comment..." className="text-sm" />
              <Button size="sm" onClick={addComment}><Send className="h-3.5 w-3.5" /></Button>
            </div>
          </div>

          {/* Delete */}
          <div className="pt-2 border-t border-border">
            <Button variant="destructive" size="sm" onClick={deleteCard}><Trash2 className="h-3.5 w-3.5 mr-1" />Delete Card</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
