import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AuthLayoutGate } from '@/components/layout/AuthLayoutGate';
import { toast } from 'sonner';
import {
  ShoppingBag, Search, RefreshCw, Trash2, ExternalLink, Phone, User,
  ChevronLeft, ChevronRight, Store, Plus, X, Bell, BellOff, MapPin, Edit2,
  ChevronDown, ImageIcon, Zap
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 36;

const STAGES = [
  { value: 'new', label: 'New', color: 'text-blue-500' },
  { value: 'researching', label: 'Researching', color: 'text-yellow-500' },
  { value: 'purchased', label: 'Purchased', color: 'text-emerald-500' },
  { value: 'listed', label: 'Listed', color: 'text-cyan-500' },
  { value: 'sold', label: 'Sold', color: 'text-purple-500' },
  { value: 'passed', label: 'Passed', color: 'text-muted-foreground' },
];

interface ArbStore {
  id: string;
  store_name: string;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
}

interface ArbItem {
  id: string;
  item_name: string;
  original_image_url: string | null;
  nobg_image_url: string | null;
  extra_images: string[] | null;
  pawn_shop_address: string | null;
  asking_price: number | null;
  wiggle_room_price: number | null;
  condition_notes: string | null;
  status: string;
  store_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ArbReminder {
  id: string;
  item_id: string;
  reminder_date: string;
  reminder_type: string;
  is_dismissed: boolean;
  notes: string | null;
}

/* ─── Store Modal ─── */
function StoreModal({ open, onClose, store, onSaved }: { open: boolean; onClose: () => void; store?: ArbStore | null; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (store) {
      setName(store.store_name); setAddress(store.address || '');
      setContactName(store.contact_name || ''); setContactPhone(store.contact_phone || '');
      setNotes(store.notes || '');
    } else {
      setName(''); setAddress(''); setContactName(''); setContactPhone(''); setNotes('');
    }
  }, [store, open]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Store name required'); return; }
    setSaving(true);
    const payload = { store_name: name.trim(), address: address || null, contact_name: contactName || null, contact_phone: contactPhone || null, notes: notes || null };
    if (store) {
      const { error } = await supabase.from('arbitrage_stores').update(payload).eq('id', store.id);
      if (error) toast.error(error.message); else { toast.success('Store updated'); onSaved(); onClose(); }
    } else {
      const { error } = await supabase.from('arbitrage_stores').insert([payload]);
      if (error) toast.error(error.message); else { toast.success('Store added'); onSaved(); onClose(); }
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{store ? 'Edit Store' : 'Add Store'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Store name *" value={name} onChange={e => setName(e.target.value)} />
          <Input placeholder="Address" value={address} onChange={e => setAddress(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Contact name" value={contactName} onChange={e => setContactName(e.target.value)} />
            <Input placeholder="Contact phone" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
          </div>
          <Textarea placeholder="Notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Item Detail Modal ─── */
function ItemDetailModal({ item, stores, open, onClose, onUpdate, onDelete }: {
  item: ArbItem | null; stores: ArbStore[]; open: boolean; onClose: () => void;
  onUpdate: (id: string, updates: Partial<ArbItem>) => void;
  onDelete: (id: string) => void;
}) {
  if (!item) return null;
  const stageInfo = STAGES.find(s => s.value === item.status) || STAGES[0];
  const spread = item.asking_price && item.wiggle_room_price ? item.asking_price - item.wiggle_room_price : null;
  const store = stores.find(s => s.id === item.store_id);
  const daysOld = differenceInDays(new Date(), new Date(item.created_at));

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-amber-500" />
            {item.item_name}
            <Badge variant="outline" className={cn("text-xs ml-2", stageInfo.color)}>{stageInfo.label}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Images */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              {item.original_image_url && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium">Original</p>
                  <img src={item.original_image_url} alt="Original" className="rounded-lg w-full h-48 object-contain bg-muted/30 cursor-pointer" onClick={() => window.open(item.original_image_url!, '_blank')} />
                </div>
              )}
              {item.nobg_image_url && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium">No Background</p>
                  <img src={item.nobg_image_url} alt="No BG" className="rounded-lg w-full h-48 object-contain bg-muted/30 cursor-pointer" onClick={() => window.open(item.nobg_image_url!, '_blank')} />
                </div>
              )}
            </div>
            {item.extra_images && item.extra_images.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground font-medium">Additional Photos ({item.extra_images.length})</p>
                <div className="grid grid-cols-3 gap-2">
                  {item.extra_images.map((url, idx) => (
                    <img key={idx} src={url} alt={`Extra ${idx + 1}`} className="rounded-lg h-24 w-full object-cover bg-muted/30 cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all" onClick={() => window.open(url, '_blank')} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Store & Contact */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Store</p>
              <p className="font-medium">{store?.store_name || item.pawn_shop_address || '—'}</p>
              {store?.address && <p className="text-xs text-muted-foreground">📍 {store.address}</p>}
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Contact</p>
              <p className="font-medium">{item.contact_name || store?.contact_name || '—'}</p>
              {(item.contact_phone || store?.contact_phone) && (
                <a href={`tel:${item.contact_phone || store?.contact_phone}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {item.contact_phone || store?.contact_phone}
                </a>
              )}
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-muted-foreground text-xs">Asking</p><p className="font-bold text-foreground">{item.asking_price != null ? `$${item.asking_price}` : '—'}</p></div>
            <div><p className="text-muted-foreground text-xs">Wiggle Room</p><p className="font-medium">{item.wiggle_room_price != null ? `$${item.wiggle_room_price}` : '—'}</p></div>
            <div><p className="text-muted-foreground text-xs">Spread</p><p className={cn("font-bold", spread && spread > 0 ? "text-emerald-500" : "text-muted-foreground")}>{spread != null ? `$${spread}` : '—'}</p></div>
          </div>

          {item.condition_notes && (
            <div><p className="text-muted-foreground text-xs mb-1">Notes</p><p className="text-sm whitespace-pre-wrap">{item.condition_notes}</p></div>
          )}

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Added {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}</span>
            <span>({daysOld}d ago)</span>
          </div>

          {/* Status + Store Assignment */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              <Select value={item.status} onValueChange={v => onUpdate(item.id, { status: v })}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Store:</span>
              <Select value={item.store_id || '__none__'} onValueChange={v => onUpdate(item.id, { store_id: v === '__none__' ? null : v })}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No store</SelectItem>
                  {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.store_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            {item.original_image_url && (
              <Button variant="outline" size="sm" onClick={() => window.open(item.original_image_url!, '_blank')}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Full Image
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={() => { onDelete(item.id); onClose(); }}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Arbitrage Page ─── */
export default function Arbitrage() {
  const [items, setItems] = useState<ArbItem[]>([]);
  const [stores, setStores] = useState<ArbStore[]>([]);
  const [reminders, setReminders] = useState<ArbReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [viewItem, setViewItem] = useState<ArbItem | null>(null);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [editStore, setEditStore] = useState<ArbStore | null>(null);
  const [tab, setTab] = useState('inventory');
  const [autoBgRemoval, setAutoBgRemoval] = useState(true);
  const [bgToggleLoading, setBgToggleLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [itemsRes, storesRes, remindersRes, bgCfgRes] = await Promise.all([
      supabase.from('arbitrage_items').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('arbitrage_stores').select('*').order('store_name'),
      supabase.from('arbitrage_reminders').select('*').eq('is_dismissed', false).lte('reminder_date', new Date().toISOString()).order('reminder_date'),
      supabase.from('site_configs').select('content').eq('site_id', 'arbitrage').eq('section', 'bg-removal').maybeSingle(),
    ]);
    if (itemsRes.error) toast.error(itemsRes.error.message);
    if (storesRes.error) toast.error(storesRes.error.message);
    setItems((itemsRes.data as ArbItem[]) || []);
    setStores((storesRes.data as ArbStore[]) || []);
    setReminders((remindersRes.data as ArbReminder[]) || []);
    setAutoBgRemoval((bgCfgRes.data?.content as any)?.enabled !== false);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    let result = items;
    if (stageFilter) result = result.filter(i => i.status === stageFilter);
    if (storeFilter) result = result.filter(i => i.store_id === storeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.item_name.toLowerCase().includes(q) ||
        (i.pawn_shop_address || '').toLowerCase().includes(q) ||
        (i.condition_notes || '').toLowerCase().includes(q) ||
        (i.contact_name || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, stageFilter, storeFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(page, totalPages);
  const paged = filtered.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [stageFilter, storeFilter, search]);

  const stageCounts = useMemo(() => {
    const map: Record<string, number> = {};
    STAGES.forEach(s => { map[s.value] = 0; });
    items.forEach(i => { if (map[i.status] !== undefined) map[i.status]++; });
    return map;
  }, [items]);

  const handleUpdate = async (id: string, updates: Partial<ArbItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
    if (viewItem?.id === id) setViewItem(prev => prev ? { ...prev, ...updates } : prev);
    const { error } = await supabase.from('arbitrage_items').update(updates as any).eq('id', id);
    if (error) { toast.error(error.message); fetchAll(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    const { error } = await supabase.from('arbitrage_items').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { setItems(prev => prev.filter(i => i.id !== id)); toast.success('Deleted'); }
  };

  const handleDismissReminder = async (reminderId: string) => {
    await supabase.from('arbitrage_reminders').update({ is_dismissed: true }).eq('id', reminderId);
    setReminders(prev => prev.filter(r => r.id !== reminderId));
    toast.success('Reminder dismissed');
  };

  const handleDeleteStore = async (storeId: string) => {
    if (!confirm('Delete this store? Items will be unlinked.')) return;
    const { error } = await supabase.from('arbitrage_stores').delete().eq('id', storeId);
    if (error) toast.error(error.message);
    else { fetchAll(); toast.success('Store deleted'); }
  };

  // Get items by store for the store view
  const storeItemCounts = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach(i => { if (i.store_id) map[i.store_id] = (map[i.store_id] || 0) + 1; });
    return map;
  }, [items]);

  const handleToggleBgRemoval = async (enabled: boolean) => {
    setBgToggleLoading(true);
    setAutoBgRemoval(enabled);
    await supabase.from('site_configs').upsert({
      site_id: 'arbitrage',
      section: 'bg-removal',
      content: { enabled },
      is_published: true,
    }, { onConflict: 'site_id,section' });
    setBgToggleLoading(false);
    toast.success(`Auto BG removal ${enabled ? 'ON' : 'OFF'}`);
  };

  const unassignedCount = items.filter(i => !i.store_id).length;

  return (
    <AuthLayoutGate>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <ShoppingBag className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Arbitrage</h1>
              <p className="text-sm text-muted-foreground">{items.length} items · {stores.length} stores</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {reminders.length > 0 && (
              <Badge variant="destructive" className="text-xs">{reminders.length} reminder{reminders.length > 1 ? 's' : ''}</Badge>
            )}
            <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5">
              <Zap className={cn("h-3.5 w-3.5", autoBgRemoval ? "text-amber-500" : "text-muted-foreground")} />
              <Label htmlFor="bg-toggle" className="text-xs cursor-pointer select-none whitespace-nowrap">Auto BG Remove</Label>
              <Switch id="bg-toggle" checked={autoBgRemoval} onCheckedChange={handleToggleBgRemoval} disabled={bgToggleLoading} />
            </div>
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1", loading && "animate-spin")} /> Refresh
            </Button>
          </div>
        </div>

        {/* Reminders Banner */}
        {reminders.length > 0 && (
          <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-2 text-amber-600"><Bell className="h-4 w-4" /> 14-Day Availability Check</p>
            {reminders.slice(0, 5).map(r => {
              const item = items.find(i => i.id === r.item_id);
              if (!item) return null;
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    {item.original_image_url && <img src={item.original_image_url} className="h-8 w-8 rounded object-cover shrink-0" />}
                    <span className="truncate font-medium">{item.item_name}</span>
                    {item.contact_phone && (
                      <a href={`tel:${item.contact_phone}`} className="text-primary text-xs hover:underline shrink-0">
                        <Phone className="h-3 w-3 inline mr-0.5" />{item.contact_phone}
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-muted-foreground">Call to check</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => handleDismissReminder(r.id)}>
                      <BellOff className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="inventory">Inventory ({items.length})</TabsTrigger>
            <TabsTrigger value="stores">Stores ({stores.length})</TabsTrigger>
          </TabsList>

          {/* ─── INVENTORY TAB ─── */}
          <TabsContent value="inventory" className="space-y-4 mt-4">
            {/* Pipeline Stages */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              <Button variant={stageFilter === null ? "default" : "outline"} size="sm" className="shrink-0 text-xs h-8" onClick={() => setStageFilter(null)}>
                All ({items.length})
              </Button>
              {STAGES.map(s => (
                <Button key={s.value} variant={stageFilter === s.value ? "default" : "outline"} size="sm" className="shrink-0 text-xs h-8" onClick={() => setStageFilter(stageFilter === s.value ? null : s.value)}>
                  {s.label} ({stageCounts[s.value] || 0})
                </Button>
              ))}
            </div>

            {/* Store filter + Search */}
            <div className="flex gap-2">
              <Select value={storeFilter || '__all__'} onValueChange={v => setStoreFilter(v === '__all__' ? null : v)}>
                <SelectTrigger className="w-48 h-9 text-xs">
                  <Store className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="All Stores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Stores</SelectItem>
                  {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.store_name} ({storeItemCounts[s.id] || 0})</SelectItem>)}
                  {unassignedCount > 0 && <SelectItem value="__unassigned__">Unassigned ({unassignedCount})</SelectItem>}
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Search items, addresses, contacts..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>

            {/* Items Grid */}
            {paged.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                {loading ? 'Loading...' : 'No items found. Send a photo to the Telegram bot to get started.'}
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {paged.map(item => {
                  const stageInfo = STAGES.find(s => s.value === item.status) || STAGES[0];
                  const sp = item.asking_price && item.wiggle_room_price ? item.asking_price - item.wiggle_room_price : null;
                  const store = stores.find(s => s.id === item.store_id);
                  const hasReminder = reminders.some(r => r.item_id === item.id);
                  return (
                    <Card key={item.id} className={cn("overflow-hidden hover:ring-1 hover:ring-primary/30 transition-all cursor-pointer group", hasReminder && "ring-1 ring-amber-500/40")} onClick={() => setViewItem(item)}>
                      {/* Image */}
                      <div className="aspect-square bg-muted/20 flex items-center justify-center overflow-hidden relative">
                        {(item.nobg_image_url || item.original_image_url) ? (
                          <img src={item.nobg_image_url || item.original_image_url || ''} alt={item.item_name} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                        )}
                        {hasReminder && (
                          <div className="absolute top-1.5 right-1.5 bg-amber-500 rounded-full p-1">
                            <Bell className="h-3 w-3 text-white" />
                          </div>
                        )}
                        <Badge variant="secondary" className={cn("absolute bottom-1.5 left-1.5 text-[10px]", stageInfo.color)}>
                          {stageInfo.label}
                        </Badge>
                      </div>
                      <CardContent className="p-3 space-y-1">
                        <h3 className="font-semibold text-xs line-clamp-1">{item.item_name}</h3>
                        {(store || item.pawn_shop_address) && (
                          <p className="text-[10px] text-muted-foreground truncate flex items-center gap-0.5">
                            <MapPin className="h-2.5 w-2.5 shrink-0" /> {store?.store_name || item.pawn_shop_address}
                          </p>
                        )}
                        {(item.contact_name) && (
                          <p className="text-[10px] text-muted-foreground truncate flex items-center gap-0.5">
                            <User className="h-2.5 w-2.5 shrink-0" /> {item.contact_name}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-[11px]">
                          {item.asking_price != null && <span className="font-bold text-foreground">${item.asking_price}</span>}
                          {sp != null && <span className="text-emerald-500 font-medium">+${sp}</span>}
                        </div>
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
                <span className="text-sm text-muted-foreground">{safeCurrentPage} / {totalPages} · {filtered.length} items</span>
                <Button variant="outline" size="sm" disabled={safeCurrentPage >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ─── STORES TAB ─── */}
          <TabsContent value="stores" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Manage your vendor stores and contacts</p>
              <Button size="sm" onClick={() => { setEditStore(null); setStoreModalOpen(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Store
              </Button>
            </div>

            {stores.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Store className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No stores yet. Add a vendor to start organizing.</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {stores.map(store => {
                  const count = storeItemCounts[store.id] || 0;
                  return (
                    <Card key={store.id} className="hover:ring-1 hover:ring-primary/30 transition-all">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-sm">{store.store_name}</h3>
                            {store.address && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{store.address}</p>}
                          </div>
                          <Badge variant="outline" className="text-xs">{count} items</Badge>
                        </div>
                        {store.contact_name && (
                          <p className="text-xs flex items-center gap-1"><User className="h-3 w-3 text-muted-foreground" />{store.contact_name}</p>
                        )}
                        {store.contact_phone && (
                          <a href={`tel:${store.contact_phone}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {store.contact_phone}
                          </a>
                        )}
                        {store.notes && <p className="text-xs text-muted-foreground line-clamp-2">{store.notes}</p>}
                        <div className="flex items-center gap-1.5 pt-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setStoreFilter(store.id); setTab('inventory'); }}>
                            View Items
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditStore(store); setStoreModalOpen(true); }}>
                            <Edit2 className="h-3 w-3 mr-1" /> Edit
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => handleDeleteStore(store.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Modals */}
        <ItemDetailModal
          item={viewItem} stores={stores} open={!!viewItem}
          onClose={() => setViewItem(null)}
          onUpdate={(id, updates) => { handleUpdate(id, updates); }}
          onDelete={handleDelete}
        />
        <StoreModal open={storeModalOpen} onClose={() => setStoreModalOpen(false)} store={editStore} onSaved={fetchAll} />
      </div>
    </AuthLayoutGate>
  );
}
