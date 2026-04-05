import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AuthLayoutGate } from '@/components/layout/AuthLayoutGate';
import { toast } from 'sonner';
import {
  ShoppingBag, Search, RefreshCw, Trash2, ExternalLink, Copy,
  ChevronLeft, ChevronRight, Eye, EyeOff, Filter
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 30;

const STAGES = [
  { value: 'new', label: 'New', color: 'bg-blue-500' },
  { value: 'researching', label: 'Researching', color: 'bg-yellow-500' },
  { value: 'purchased', label: 'Purchased', color: 'bg-emerald-500' },
  { value: 'sold', label: 'Sold', color: 'bg-purple-500' },
  { value: 'passed', label: 'Passed', color: 'bg-muted-foreground' },
];

interface ArbItem {
  id: string;
  item_name: string;
  original_image_url: string | null;
  nobg_image_url: string | null;
  pawn_shop_address: string | null;
  asking_price: number | null;
  wiggle_room_price: number | null;
  condition_notes: string | null;
  status: string;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export default function Arbitrage() {
  const [items, setItems] = useState<ArbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [viewItem, setViewItem] = useState<ArbItem | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('arbitrage_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setItems((data as ArbItem[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const filtered = useMemo(() => {
    let result = items;
    if (stageFilter) result = result.filter(i => i.status === stageFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.item_name.toLowerCase().includes(q) ||
        (i.pawn_shop_address || '').toLowerCase().includes(q) ||
        (i.condition_notes || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, stageFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(page, totalPages);
  const paged = filtered.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [stageFilter, search]);

  const stageCounts = useMemo(() => {
    const map: Record<string, number> = {};
    STAGES.forEach(s => { map[s.value] = 0; });
    items.forEach(i => { if (map[i.status] !== undefined) map[i.status]++; });
    return map;
  }, [items]);

  const handleStatusChange = async (item: ArbItem, newStatus: string) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i));
    const { error } = await supabase.from('arbitrage_items').update({ status: newStatus }).eq('id', item.id);
    if (error) { toast.error(error.message); fetchItems(); }
  };

  const handleDelete = async (item: ArbItem) => {
    if (!confirm(`Delete "${item.item_name}"?`)) return;
    const { error } = await supabase.from('arbitrage_items').delete().eq('id', item.id);
    if (error) toast.error(error.message);
    else { setItems(prev => prev.filter(i => i.id !== item.id)); toast.success('Deleted'); }
  };

  const spread = (item: ArbItem) => {
    if (item.asking_price && item.wiggle_room_price) return item.asking_price - item.wiggle_room_price;
    return null;
  };

  return (
    <AuthLayoutGate>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <ShoppingBag className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Arbitrage</h1>
              <p className="text-sm text-muted-foreground">{items.length} items logged via Telegram</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchItems} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1", loading && "animate-spin")} /> Refresh
          </Button>
        </div>

        {/* Pipeline Stages */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button
            variant={stageFilter === null ? "default" : "outline"}
            size="sm"
            className="shrink-0 text-xs h-8"
            onClick={() => setStageFilter(null)}
          >
            All ({items.length})
          </Button>
          {STAGES.map(s => (
            <Button
              key={s.value}
              variant={stageFilter === s.value ? "default" : "outline"}
              size="sm"
              className="shrink-0 text-xs h-8"
              onClick={() => setStageFilter(stageFilter === s.value ? null : s.value)}
            >
              {s.label} ({stageCounts[s.value] || 0})
            </Button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search items, addresses, notes..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Items Grid */}
        {paged.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            {loading ? 'Loading...' : 'No arbitrage items found. Send a photo to the Telegram bot to get started.'}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {paged.map(item => {
              const stageInfo = STAGES.find(s => s.value === item.status) || STAGES[0];
              const sp = spread(item);
              return (
                <Card key={item.id} className="overflow-hidden hover:ring-1 hover:ring-primary/30 transition-all cursor-pointer" onClick={() => setViewItem(item)}>
                  {/* Image */}
                  {(item.nobg_image_url || item.original_image_url) && (
                    <div className="h-40 bg-muted/30 flex items-center justify-center overflow-hidden">
                      <img
                        src={item.nobg_image_url || item.original_image_url || ''}
                        alt={item.item_name}
                        className="h-full w-full object-contain"
                      />
                    </div>
                  )}
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm line-clamp-2">{item.item_name}</h3>
                      <Badge variant="outline" className="shrink-0 text-[10px]">{stageInfo.label}</Badge>
                    </div>
                    {item.pawn_shop_address && (
                      <p className="text-xs text-muted-foreground">📍 {item.pawn_shop_address}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs">
                      {item.asking_price != null && (
                        <span className="text-foreground font-medium">💰 ${item.asking_price}</span>
                      )}
                      {item.wiggle_room_price != null && (
                        <span className="text-muted-foreground">🤝 ${item.wiggle_room_price}</span>
                      )}
                      {sp != null && (
                        <span className="text-emerald-500 font-medium">Δ ${sp}</span>
                      )}
                    </div>
                    {item.condition_notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2">📝 {item.condition_notes}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={safeCurrentPage <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{safeCurrentPage} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={safeCurrentPage >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Detail Modal */}
        <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
          <DialogContent className="max-w-lg">
            {viewItem && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5 text-amber-500" />
                    {viewItem.item_name}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Images */}
                  <div className="grid grid-cols-2 gap-2">
                    {viewItem.original_image_url && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground font-medium">Original</p>
                        <img src={viewItem.original_image_url} alt="Original" className="rounded-md w-full h-32 object-contain bg-muted/30" />
                      </div>
                    )}
                    {viewItem.nobg_image_url && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground font-medium">No Background</p>
                        <img src={viewItem.nobg_image_url} alt="No BG" className="rounded-md w-full h-32 object-contain bg-muted/30" />
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="space-y-2 text-sm">
                    {viewItem.pawn_shop_address && <p>📍 <strong>Shop:</strong> {viewItem.pawn_shop_address}</p>}
                    {viewItem.asking_price != null && <p>💰 <strong>Asking:</strong> ${viewItem.asking_price}</p>}
                    {viewItem.wiggle_room_price != null && <p>🤝 <strong>Wiggle:</strong> ${viewItem.wiggle_room_price}</p>}
                    {spread(viewItem) != null && <p className="text-emerald-500">📊 <strong>Spread:</strong> ${spread(viewItem)}</p>}
                    {viewItem.condition_notes && <p>📝 <strong>Notes:</strong> {viewItem.condition_notes}</p>}
                    <p className="text-muted-foreground text-xs">Created {format(new Date(viewItem.created_at), 'MMM d, yyyy h:mm a')}</p>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Status:</span>
                    <Select value={viewItem.status} onValueChange={v => { handleStatusChange(viewItem, v); setViewItem({ ...viewItem, status: v }); }}>
                      <SelectTrigger className="w-40 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {viewItem.original_image_url && (
                      <Button variant="outline" size="sm" onClick={() => window.open(viewItem.original_image_url!, '_blank')}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Image
                      </Button>
                    )}
                    <Button variant="destructive" size="sm" onClick={() => { handleDelete(viewItem); setViewItem(null); }}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AuthLayoutGate>
  );
}
