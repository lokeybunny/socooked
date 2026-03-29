import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Users, Plus, Zap, Eye, Pencil, Trash2, ArrowUpDown, Radio, Home, Square, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import BuyerDetail from './BuyerDetail';
import BuyerInterests, { emptyInterests, type InterestsData } from './BuyerInterests';

const STAGES = [
  { key: 'all', label: 'All' },
  { key: 'new_scraped', label: 'New Scraped' },
  { key: 'needs_review', label: 'Needs Review' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'warm', label: 'Warm' },
  { key: 'active', label: 'Active' },
  { key: 'closed', label: 'Closed' },
  { key: 'inactive', label: 'Inactive' },
];

const STAGE_COLORS: Record<string, string> = {
  new_scraped: 'bg-blue-500/10 text-blue-500',
  needs_review: 'bg-yellow-500/10 text-yellow-500',
  qualified: 'bg-green-500/10 text-green-500',
  contacted: 'bg-purple-500/10 text-purple-500',
  active: 'bg-emerald-500/10 text-emerald-500',
  warm: 'bg-orange-500/10 text-orange-500',
  closed: 'bg-muted text-muted-foreground',
  inactive: 'bg-destructive/10 text-destructive',
};

const DEAL_TYPES = [
  { key: 'land', label: '🏞️ Land' },
  { key: 'home', label: '🏠 Homes' },
  { key: 'multi_home', label: 'Multi-Home' },
];

const emptyForm = {
  full_name: '', email: '', phone: '', entity_name: '', deal_types: ['land'] as string[],
  target_states: '', target_counties: '', budget_min: '', budget_max: '',
  acreage_min: '', acreage_max: '', activity_score: '50', buyer_type: 'unknown',
  intent_level: 'low', pipeline_stage: 'new_scraped', city: '', notes: '', source: 'manual',
  closing_speed: '', contact_preference: 'email', website: '',
};

export default function BuyerDiscovery() {
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [intentFilter, setIntentFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortField, setSortField] = useState<string>('buyer_score');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [interests, setInterests] = useState<InterestsData>(emptyInterests);
  const [runningDiscovery, setRunningDiscovery] = useState(false);
  const [page, setPage] = useState(1);
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [realtimeCount, setRealtimeCount] = useState(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [discoverySources, setDiscoverySources] = useState<any[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const PAGE_SIZE = 25;

  const pollForResults = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('buyer-discovery', { body: { action: 'poll' } });
      if (error) throw error;

      const results = data?.results || [];
      const ingested = results.filter((r: any) => r.status === 'ingested');
      if (ingested.length > 0) {
        await loadBuyers();
        const totalNew = ingested.reduce((sum: number, r: any) => sum + Number(r.ingest?.new || 0), 0);
        const totalUpdated = ingested.reduce((sum: number, r: any) => sum + Number(r.ingest?.updated || 0), 0);
        toast.success(`Imported ${totalNew} new and ${totalUpdated} updated buyers`);
        return true;
      }

      return !results.some((r: any) => r.status === 'still_running');
    } catch {
      return true;
    }
  };

  const startPolling = () => {
    let attempts = 0;
    const maxAttempts = 36;
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    const interval = setInterval(async () => {
      attempts += 1;
      const done = await pollForResults();
      if (done || attempts >= maxAttempts) {
        clearInterval(interval);
        pollIntervalRef.current = null;
        setRunningDiscovery(false);
        if (attempts >= maxAttempts) toast.info('Scrape is still processing — check back shortly');
      }
    }, 5000);
    pollIntervalRef.current = interval;
  };

  const stopDiscovery = async () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setRunningDiscovery(false);
    try {
      const { data, error } = await supabase.functions.invoke('buyer-discovery', { body: { action: 'abort' } });
      if (error) throw error;
      toast.success(`Stopped ${data?.aborted || 0} running scrape(s)`);
      await loadBuyers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to stop');
    }
  };

  useEffect(() => {
    loadBuyers();

    // Supabase Realtime: live feed as buyers are ingested
    const channel = supabase
      .channel('lw_buyers_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lw_buyers' }, (payload) => {
        setBuyers(prev => [payload.new as any, ...prev]);
        setRealtimeCount(c => c + 1);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lw_buyers' }, (payload) => {
        setBuyers(prev => prev.map(b => b.id === (payload.new as any).id ? payload.new as any : b));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lw_buyers' }, (payload) => {
        setBuyers(prev => prev.filter(b => b.id !== (payload.old as any).id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadBuyers = async () => {
    setLoading(true);
    const [buyersRes, sourcesRes] = await Promise.all([
      supabase.from('lw_buyers').select('*').order('created_at', { ascending: false }),
      supabase.from('lw_buyer_discovery_sources').select('id, name, platform, is_enabled').eq('is_enabled', true).order('name'),
    ]);
    setBuyers(buyersRes.data || []);
    setDiscoverySources(sourcesRes.data || []);
    setLoading(false);
  };

  // Pipeline counts
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: buyers.length };
    buyers.forEach(b => {
      const stage = b.pipeline_stage || 'new_scraped';
      counts[stage] = (counts[stage] || 0) + 1;
    });
    return counts;
  }, [buyers]);

  // Available states for filter
  const availableStates = useMemo(() => {
    const states = new Set<string>();
    buyers.forEach(b => (b.target_states || []).forEach((s: string) => states.add(s)));
    return Array.from(states).sort();
  }, [buyers]);

  // Filtered + sorted buyers
  const filtered = useMemo(() => {
    let list = [...buyers];
    if (stageFilter !== 'all') list = list.filter(b => (b.pipeline_stage || 'new_scraped') === stageFilter);
    if (typeFilter !== 'all') list = list.filter(b => b.buyer_type === typeFilter);
    if (intentFilter !== 'all') list = list.filter(b => b.intent_level === intentFilter);
    if (stateFilter !== 'all') list = list.filter(b => (b.target_states || []).includes(stateFilter));
    if (sourceFilter !== 'all') list = list.filter(b => b.source === sourceFilter || b.source_platform === sourceFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        (b.full_name || '').toLowerCase().includes(q) ||
        (b.entity_name || '').toLowerCase().includes(q) ||
        (b.email || '').toLowerCase().includes(q) ||
        (b.notes || '').toLowerCase().includes(q) ||
        (b.city || '').toLowerCase().includes(q) ||
        (b.target_states || []).join(' ').toLowerCase().includes(q) ||
        (b.target_counties || []).join(' ').toLowerCase().includes(q) ||
        (b.tags || []).join(' ').toLowerCase().includes(q)
      );
    }
    // Hide duplicates: deduplicate by normalized full_name + source_url, also by entity_name
    if (hideDuplicates) {
      const seen = new Set<string>();
      const seenNames = new Set<string>();
      list = list.filter(b => {
        const nameKey = (b.full_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const urlKey = (b.source_url || '').toLowerCase().trim();
        const entityKey = (b.entity_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const compositeKey = nameKey + '|' + urlKey;
        // Dedup by composite key
        if (compositeKey !== '|' && seen.has(compositeKey)) return false;
        // Also dedup by name alone if identical
        if (nameKey && seenNames.has(nameKey)) return false;
        if (compositeKey !== '|') seen.add(compositeKey);
        if (nameKey) seenNames.add(nameKey);
        if (entityKey) seenNames.add(entityKey);
        return true;
      });
    }
    list.sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return list;
  }, [buyers, stageFilter, typeFilter, intentFilter, stateFilter, sourceFilter, search, sortField, sortAsc, hideDuplicates]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [stageFilter, typeFilter, intentFilter, stateFilter, sourceFilter, search, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const runDiscovery = async () => {
    setRunningDiscovery(true);
    try {
      const payload: any = {};
      if (selectedSourceIds.length > 0) {
        payload.source_ids = selectedSourceIds;
      }
      const { data, error } = await supabase.functions.invoke('buyer-discovery', { body: payload });
      if (error) throw error;

      const started = data?.results?.some((r: any) => r.status === 'started');
      if (started) {
        startPolling();
      }

      const count = data?.results?.filter((r: any) => r.status === 'started').length || 0;
      toast.success(`Discovery started — ${count} source${count !== 1 ? 's' : ''} running`);
    } catch (err: any) {
      toast.error(err.message || 'Discovery failed');
    }
    setRunningDiscovery(false);
  };

  const updateStage = async (id: string, stage: string) => {
    await supabase.from('lw_buyers').update({ pipeline_stage: stage }).eq('id', id);
    toast.success(`Moved to ${stage.replace(/_/g, ' ')}`);

    // Auto-queue qualified buyers to daily call list
    if (stage === 'qualified') {
      const buyer = buyers.find(b => b.id === id);
      if (buyer) {
        const today = new Date().toISOString().split('T')[0];
        // Check if already queued today
        const { data: existing } = await supabase.from('lw_call_queue')
          .select('id')
          .eq('seller_id', id)
          .eq('queue_date', today)
          .limit(1);
        if (!existing || existing.length === 0) {
          await supabase.from('lw_call_queue').insert({
            seller_id: id,
            owner_name: buyer.full_name,
            owner_phone: buyer.phone || null,
            property_address: buyer.phone ? null : 'Phone # TBA',
            reason: `Qualified buyer — ${buyer.source_platform || buyer.source || 'manual'}`,
            queue_date: today,
            call_priority: 1,
            status: 'pending',
          });
          toast.success('Added to today\'s call list');
        }
      }
    }

    loadBuyers();
  };

  const openAdd = () => { setEditId(null); setForm(emptyForm); setInterests(emptyInterests); setAddOpen(true); };
  const openEdit = (b: any) => {
    setEditId(b.id);
    setForm({
      full_name: b.full_name || '', email: b.email || '', phone: b.phone || '',
      entity_name: b.entity_name || '',
      deal_types: b.meta?.deal_types || [b.deal_type || 'land'],
      target_states: (b.target_states || []).join(', '),
      target_counties: (b.target_counties || []).join(', '),
      budget_min: b.budget_min?.toString() || '', budget_max: b.budget_max?.toString() || '',
      acreage_min: b.acreage_min?.toString() || '', acreage_max: b.acreage_max?.toString() || '',
      activity_score: (b.activity_score || 50).toString(),
      buyer_type: b.buyer_type || 'unknown', intent_level: b.intent_level || 'low',
      pipeline_stage: b.pipeline_stage || 'new_scraped', city: b.city || '',
      notes: b.notes || '', source: b.source || 'manual',
      closing_speed: b.meta?.closing_speed || '',
      contact_preference: b.meta?.contact_preference || 'email',
      website: b.meta?.website || '',
    });
    setInterests(b.meta?.interests || emptyInterests);
    setAddOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast.error('Name required'); return; }
    const payload: any = {
      full_name: form.full_name.trim(),
      email: form.email.trim() || null, phone: form.phone.trim() || null,
      entity_name: form.entity_name.trim() || null, deal_type: form.deal_types[0] || 'land',
      target_states: form.target_states.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
      target_counties: form.target_counties.split(',').map(s => s.trim()).filter(Boolean),
      budget_min: form.budget_min ? Number(form.budget_min) : null,
      budget_max: form.budget_max ? Number(form.budget_max) : null,
      acreage_min: form.acreage_min ? Number(form.acreage_min) : null,
      acreage_max: form.acreage_max ? Number(form.acreage_max) : null,
      activity_score: Number(form.activity_score) || 50,
      buyer_type: form.buyer_type, intent_level: form.intent_level,
      pipeline_stage: form.pipeline_stage, city: form.city.trim() || null,
      notes: form.notes.trim() || null, source: form.source, status: 'active',
      meta: {
        interests,
        deal_types: form.deal_types,
        closing_speed: form.closing_speed || null,
        contact_preference: form.contact_preference,
        website: form.website.trim() || null,
      },
      property_type_interest: interests.property_types,
    };
    let savedId = editId;
    if (editId) {
      const { error } = await supabase.from('lw_buyers').update(payload).eq('id', editId);
      if (error) { toast.error(error.message); return; }
      toast.success('Buyer updated');
    } else {
      const { data, error } = await supabase.from('lw_buyers').insert(payload).select('id').single();
      if (error) { toast.error(error.message); return; }
      savedId = data?.id || null;
      toast.success('Buyer added');
    }

    // Auto-queue if saved as qualified
    if (payload.pipeline_stage === 'qualified' && savedId) {
      const today = new Date().toISOString().split('T')[0];
      const { data: existing } = await supabase.from('lw_call_queue')
        .select('id').eq('seller_id', savedId).eq('queue_date', today).limit(1);
      if (!existing || existing.length === 0) {
        await supabase.from('lw_call_queue').insert({
          seller_id: savedId,
          owner_name: payload.full_name,
          owner_phone: payload.phone || null,
          property_address: payload.phone ? null : 'Phone # TBA',
          reason: `Qualified buyer — ${payload.source || 'manual'}`,
          queue_date: today,
          call_priority: 1,
          status: 'pending',
        });
        toast.success('Added to today\'s call list');
      }
    }

    setAddOpen(false);
    loadBuyers();
  };

  const deleteBuyer = async (id: string) => {
    if (!confirm('Delete this buyer?')) return;
    await supabase.from('lw_buyers').delete().eq('id', id);
    toast.success('Deleted');
    loadBuyers();
  };

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      {/* Pipeline Stage Bar + Hide Duplicates */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 flex-1">
          {STAGES.map(s => (
            <Button
              key={s.key}
              size="sm"
              variant={stageFilter === s.key ? 'default' : 'outline'}
              className="text-xs whitespace-nowrap"
              onClick={() => setStageFilter(s.key)}
            >
              {s.label}
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                {stageCounts[s.key] || 0}
              </Badge>
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3 shrink-0 border-l pl-3 ml-2">
          {realtimeCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-green-500 animate-pulse">
              <Radio className="h-3 w-3" />
              <span>+{realtimeCount} live</span>
            </div>
          )}
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground whitespace-nowrap">
            <Checkbox checked={hideDuplicates} onCheckedChange={(v) => setHideDuplicates(!!v)} />
            Hide Duplicates
          </label>
        </div>
      </div>

      {/* Actions + Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search buyers…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="cash_buyer">Cash Buyer</SelectItem>
                <SelectItem value="investor">Investor</SelectItem>
                <SelectItem value="land_buyer">Land Buyer</SelectItem>
                <SelectItem value="developer">Developer</SelectItem>
                <SelectItem value="wholesaler_buyer">Wholesaler</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
            <Select value={intentFilter} onValueChange={setIntentFilter}>
              <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Intent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Intent</SelectItem>
                <SelectItem value="high">🔥 High</SelectItem>
                <SelectItem value="medium">⚡ Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            {availableStates.length > 0 && (
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger className="w-[100px] h-9"><SelectValue placeholder="State" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {availableStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="apify">Apify</SelectItem>
                <SelectItem value="reapi">REAPI</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="twitter">Twitter</SelectItem>
                <SelectItem value="craigslist">Craigslist</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-1.5 ml-auto">
              {runningDiscovery ? (
                <Button size="sm" variant="destructive" onClick={stopDiscovery}>
                  <Square className="h-3 w-3 mr-1 fill-current" /> Stop
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={runDiscovery}>
                  <Zap className="h-3.5 w-3.5 mr-1" /> Run Discovery
                </Button>
              )}
              <Button size="sm" onClick={openAdd}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Buyer
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Buyers Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-4 w-4" />
            Buyer Pipeline
            <Badge variant="outline" className="ml-auto">{filtered.length} buyers</Badge>
            {totalPages > 1 && (
              <span className="text-xs text-muted-foreground ml-2">
                Page {page}/{totalPages}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No buyers found</p>
              <p className="text-xs mt-1">Add buyers manually or run discovery to find them</p>
              <div className="flex gap-2 justify-center mt-3">
                <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" /> Add Buyer</Button>
                <Button size="sm" variant="outline" onClick={runDiscovery}>
                  <Zap className="h-3.5 w-3.5 mr-1" /> Run Discovery
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('full_name')}>
                      Name {sortField === 'full_name' && <ArrowUpDown className="h-3 w-3 inline ml-1" />}
                    </TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('buyer_score')}>
                      Score {sortField === 'buyer_score' && <ArrowUpDown className="h-3 w-3 inline ml-1" />}
                    </TableHead>
                    <TableHead>Intent</TableHead>
                    <TableHead>States</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(b => (
                    <TableRow key={b.id} className="cursor-pointer" onClick={() => { setSelectedBuyer(b); setDetailOpen(true); }}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{b.full_name}</span>
                          {b.entity_name && <span className="text-xs text-muted-foreground block">{b.entity_name}</span>}
                          {b.city && <span className="text-xs text-muted-foreground">{b.city}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                          {b.buyer_type?.replace(/_/g, ' ') || 'unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={b.pipeline_stage || 'new_scraped'} onValueChange={(v) => { updateStage(b.id, v); }}>
                          <SelectTrigger className="h-7 text-[10px] w-[110px]" onClick={e => e.stopPropagation()}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAGES.filter(s => s.key !== 'all').map(s => (
                              <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <span className={`font-mono text-sm font-semibold ${
                          (b.buyer_score || 0) >= 70 ? 'text-green-500' :
                          (b.buyer_score || 0) >= 40 ? 'text-yellow-500' : 'text-muted-foreground'
                        }`}>{b.buyer_score || b.activity_score || 0}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${
                          b.intent_level === 'high' ? 'bg-red-500/10 text-red-500' :
                          b.intent_level === 'medium' ? 'bg-yellow-500/10 text-yellow-500' :
                          'bg-muted text-muted-foreground'
                        }`}>{b.intent_level || 'low'}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[100px] truncate">
                        {(b.target_states || []).join(', ') || '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {b.budget_min || b.budget_max
                          ? `$${(b.budget_min || 0).toLocaleString()}–$${(b.budget_max || 0).toLocaleString()}`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {b.source_platform || b.source || 'manual'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setSelectedBuyer(b); setDetailOpen(true); }}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(b)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteBuyer(b.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <span className="text-xs text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | string)[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    typeof p === 'string' ? (
                      <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                    ) : (
                      <Button
                        key={p}
                        size="sm"
                        variant={p === page ? 'default' : 'outline'}
                        className="h-8 w-8 p-0 text-xs"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    )
                  )}
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Buyer' : 'Add New Buyer'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Full Name *</Label><Input value={form.full_name} onChange={e => set('full_name', e.target.value)} /></div>
              <div className="space-y-1"><Label>Entity / LLC</Label><Input value={form.entity_name} onChange={e => set('entity_name', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
              <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>City</Label><Input value={form.city} onChange={e => set('city', e.target.value)} /></div>
              <div className="space-y-1">
                <Label>Pipeline Stage</Label>
                <Select value={form.pipeline_stage} onValueChange={v => set('pipeline_stage', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.filter(s => s.key !== 'all').map(s => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Deal Types Interested In *</Label>
              <div className="flex gap-4">
                {DEAL_TYPES.map(dt => (
                  <label key={dt.key} className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <Checkbox
                      checked={form.deal_types.includes(dt.key)}
                      onCheckedChange={(checked) => {
                        setForm(p => {
                          const next = checked
                            ? [...p.deal_types, dt.key]
                            : p.deal_types.filter(t => t !== dt.key);
                          return { ...p, deal_types: next.length ? next : p.deal_types };
                        });
                      }}
                    />
                    {dt.key === 'multi_home' ? (
                      <span className="flex items-center gap-1"><span className="relative flex items-center w-5 h-4"><Home className="h-3.5 w-3.5 text-purple-500 absolute left-0" /><Home className="h-3.5 w-3.5 text-purple-400 absolute left-1.5" /></span> Multi-Home</span>
                    ) : dt.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Buyer Type</Label>
                <Select value={form.buyer_type} onValueChange={v => set('buyer_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="cash_buyer">Cash Buyer</SelectItem>
                    <SelectItem value="investor">Investor</SelectItem>
                    <SelectItem value="land_buyer">Land Buyer</SelectItem>
                    <SelectItem value="developer">Developer</SelectItem>
                    <SelectItem value="wholesaler_buyer">Wholesaler</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Intent Level</Label>
                <Select value={form.intent_level} onValueChange={v => set('intent_level', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Target States <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
              <Input value={form.target_states} onChange={e => set('target_states', e.target.value)} placeholder="TX, FL, AZ" />
            </div>
            <div className="space-y-1">
              <Label>Target Counties <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
              <Input value={form.target_counties} onChange={e => set('target_counties', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Budget Min ($)</Label><Input type="number" value={form.budget_min} onChange={e => set('budget_min', e.target.value)} /></div>
              <div className="space-y-1"><Label>Budget Max ($)</Label><Input type="number" value={form.budget_max} onChange={e => set('budget_max', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Acreage Min</Label><Input type="number" value={form.acreage_min} onChange={e => set('acreage_min', e.target.value)} /></div>
              <div className="space-y-1"><Label>Acreage Max</Label><Input type="number" value={form.acreage_max} onChange={e => set('acreage_max', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>How Fast Can You Close?</Label>
                <Input value={form.closing_speed} onChange={e => set('closing_speed', e.target.value)} placeholder="e.g. 7 days, 2 weeks" />
              </div>
              <div className="space-y-1">
                <Label>Best Point of Contact</Label>
                <Select value={form.contact_preference} onValueChange={v => set('contact_preference', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">📧 Email</SelectItem>
                    <SelectItem value="text">💬 Text</SelectItem>
                    <SelectItem value="phone">📞 Phone Call</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Buyer's Website</Label>
              <Input value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://example.com" />
            </div>
            {/* Buyer Interests & Property Specs */}
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-bold mb-3">🎯 Buyer Interests & Property Specs</h3>
              <BuyerInterests interests={interests} onChange={setInterests} />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
            </div>
            <Button className="w-full" onClick={handleSave}>{editId ? 'Update Buyer' : 'Add Buyer'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      {selectedBuyer && (
        <BuyerDetail
          buyer={selectedBuyer}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          onUpdate={loadBuyers}
        />
      )}
    </div>
  );
}
