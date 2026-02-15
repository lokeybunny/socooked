import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, ArrowLeft, GripVertical, MoreHorizontal, Tag, Calendar, User, Paperclip, MessageSquare, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';
import { DndContext, closestCorners, DragEndEvent, DragOverEvent, DragStartEvent, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { CardDetailModal } from '@/components/boards/CardDetailModal';

interface CardType {
  id: string; title: string; description: string | null; list_id: string; position: number;
  priority: string; status: string; source: string | null; source_url: string | null;
  due_date: string | null; assigned_to: string | null; created_at: string;
  card_labels?: { label_id: string; labels?: { id: string; name: string; color: string | null } }[];
  card_comments?: { id: string }[];
  checklists?: { id: string; checklist_items?: { id: string; is_done: boolean }[] }[];
  card_attachments?: { id: string }[];
}

interface ListType {
  id: string; name: string; position: number; board_id: string;
}

function SortableCard({ card, onClick }: { card: CardType; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const priorityColors: Record<string, string> = {
    low: 'border-l-muted-foreground/30', medium: 'border-l-info', high: 'border-l-warning', urgent: 'border-l-destructive',
  };

  const commentCount = card.card_comments?.length || 0;
  const checkTotal = card.checklists?.reduce((s, c) => s + (c.checklist_items?.length || 0), 0) || 0;
  const checkDone = card.checklists?.reduce((s, c) => s + (c.checklist_items?.filter(i => i.is_done).length || 0), 0) || 0;
  const attachCount = card.card_attachments?.length || 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card rounded-lg border border-border shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow border-l-4",
        priorityColors[card.priority] || 'border-l-transparent',
        isDragging && "opacity-50"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="mt-0.5 text-muted-foreground/50 hover:text-muted-foreground cursor-grab" onClick={e => e.stopPropagation()}>
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          {card.card_labels && card.card_labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {card.card_labels.map(cl => (
                <span key={cl.label_id} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${cl.labels?.color || '#6366f1'}20`, color: cl.labels?.color || '#6366f1' }}>
                  {cl.labels?.name}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm font-medium text-foreground leading-snug">{card.title}</p>
          <div className="flex items-center gap-2 mt-2 text-muted-foreground">
            {card.source && <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{card.source}</span>}
            {card.due_date && <span className="text-[10px] flex items-center gap-0.5"><Calendar className="h-2.5 w-2.5" />{new Date(card.due_date).toLocaleDateString()}</span>}
            {commentCount > 0 && <span className="text-[10px] flex items-center gap-0.5"><MessageSquare className="h-2.5 w-2.5" />{commentCount}</span>}
            {checkTotal > 0 && <span className="text-[10px] flex items-center gap-0.5"><CheckSquare className="h-2.5 w-2.5" />{checkDone}/{checkTotal}</span>}
            {attachCount > 0 && <span className="text-[10px] flex items-center gap-0.5"><Paperclip className="h-2.5 w-2.5" />{attachCount}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BoardView() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [board, setBoard] = useState<any>(null);
  const [lists, setLists] = useState<ListType[]>([]);
  const [cards, setCards] = useState<CardType[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingToList, setAddingToList] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newListName, setNewListName] = useState('');
  const [addingList, setAddingList] = useState(false);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const load = useCallback(async () => {
    if (!boardId) return;
    const [boardRes, listsRes, cardsRes, labelsRes] = await Promise.all([
      supabase.from('boards').select('*').eq('id', boardId).single(),
      supabase.from('lists').select('*').eq('board_id', boardId).order('position'),
      supabase.from('cards').select('*, card_labels(label_id, labels:labels(id, name, color)), card_comments(id), checklists(id, checklist_items(id, is_done)), card_attachments(id)').eq('board_id', boardId).order('position'),
      supabase.from('labels').select('*').eq('board_id', boardId),
    ]);
    setBoard(boardRes.data);
    setLists(listsRes.data || []);
    setCards(cardsRes.data || []);
    setLabels(labelsRes.data || []);
    setLoading(false);
  }, [boardId]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!boardId) return;
    const channel = supabase.channel(`board-${boardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: `board_id=eq.${boardId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [boardId, load]);

  const addCard = async (listId: string) => {
    if (!newCardTitle.trim()) return;
    const maxPos = cards.filter(c => c.list_id === listId).reduce((m, c) => Math.max(m, c.position), -1);
    const { error } = await supabase.from('cards').insert({
      board_id: boardId, list_id: listId, title: newCardTitle.trim(),
      position: maxPos + 1, created_by: user?.id,
    });
    if (error) toast.error(error.message);
    setNewCardTitle('');
    setAddingToList(null);
    load();
  };

  const addList = async () => {
    if (!newListName.trim()) return;
    const maxPos = lists.reduce((m, l) => Math.max(m, l.position), -1);
    const { error } = await supabase.from('lists').insert({
      board_id: boardId, name: newListName.trim(), position: maxPos + 1,
    });
    if (error) toast.error(error.message);
    setNewListName('');
    setAddingList(false);
    load();
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const cardId = active.id as string;
    const card = cards.find(c => c.id === cardId);
    if (!card) return;

    // Determine target list
    let targetListId: string;
    const overCard = cards.find(c => c.id === over.id);
    if (overCard) {
      targetListId = overCard.list_id;
    } else {
      // Dropped on a list container
      targetListId = over.id as string;
    }

    const listCards = cards.filter(c => c.list_id === targetListId && c.id !== cardId).sort((a, b) => a.position - b.position);
    let newPos = 0;
    if (overCard) {
      const overIdx = listCards.findIndex(c => c.id === overCard.id);
      newPos = overIdx >= 0 ? overIdx : listCards.length;
    } else {
      newPos = listCards.length;
    }

    await supabase.from('cards').update({ list_id: targetListId, position: newPos }).eq('id', cardId);
    load();
  };

  const handleDragOver = (event: DragOverEvent) => {
    // handled in dragEnd
  };

  const activeCard = activeId ? cards.find(c => c.id === activeId) : null;

  if (loading) return <AppLayout><div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div></AppLayout>;

  return (
    <AppLayout>
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/boards')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">{board?.name}</h1>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragOver={handleDragOver}>
          <div className="flex-1 overflow-x-auto pb-4">
            <div className="flex gap-4 items-start min-h-0" style={{ minWidth: 'max-content' }}>
              {lists.map(list => {
                const listCards = cards.filter(c => c.list_id === list.id).sort((a, b) => a.position - b.position);
                return (
                  <div key={list.id} className="w-72 shrink-0 bg-muted/50 rounded-xl p-3 flex flex-col max-h-[calc(100vh-12rem)]">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <h3 className="text-sm font-semibold text-foreground">{list.name}</h3>
                      <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{listCards.length}</span>
                    </div>

                    <SortableContext items={listCards.map(c => c.id)} strategy={verticalListSortingStrategy} id={list.id}>
                      <div className="flex-1 overflow-y-auto space-y-2 min-h-[2rem]" data-list-id={list.id}>
                        {listCards.map(card => (
                          <SortableCard key={card.id} card={card} onClick={() => setSelectedCard(card.id)} />
                        ))}
                      </div>
                    </SortableContext>

                    {addingToList === list.id ? (
                      <div className="mt-2 space-y-2">
                        <Input
                          autoFocus
                          value={newCardTitle}
                          onChange={e => setNewCardTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addCard(list.id); if (e.key === 'Escape') setAddingToList(null); }}
                          placeholder="Card title..."
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => addCard(list.id)}>Add</Button>
                          <Button size="sm" variant="ghost" onClick={() => setAddingToList(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAddingToList(list.id)} className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-1 py-1.5 rounded-lg hover:bg-muted/80 w-full">
                        <Plus className="h-3.5 w-3.5" /> Add card
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Add list */}
              <div className="w-72 shrink-0">
                {addingList ? (
                  <div className="bg-muted/50 rounded-xl p-3 space-y-2">
                    <Input autoFocus value={newListName} onChange={e => setNewListName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addList(); if (e.key === 'Escape') setAddingList(false); }}
                      placeholder="List name..." className="text-sm" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={addList}>Add List</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAddingList(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingList(true)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/50 rounded-xl p-3 w-full transition-colors">
                    <Plus className="h-4 w-4" /> Add list
                  </button>
                )}
              </div>
            </div>
          </div>

          <DragOverlay>
            {activeCard && (
              <div className="bg-card rounded-lg border border-border shadow-lg p-3 w-72 opacity-90">
                <p className="text-sm font-medium text-foreground">{activeCard.title}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {selectedCard && (
        <CardDetailModal
          cardId={selectedCard}
          boardId={boardId!}
          labels={labels}
          onClose={() => setSelectedCard(null)}
          onUpdate={load}
        />
      )}
    </AppLayout>
  );
}
