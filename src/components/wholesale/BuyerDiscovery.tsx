import { useState, useEffect, useMemo } from 'react';
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
import { Search, Users, Plus, Zap, Eye, Pencil, Trash2, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import BuyerDetail from './BuyerDetail';

const STAGES = [
  { key: 'all', label: 'All' },
  { key: 'new_scraped', label: 'New Scraped' },
  { key: 'needs_review', label: 'Needs Review' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'active', label: 'Active' },
  { key: 'warm', label: 'Warm' },
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

const emptyForm = {
  full_name: '', email: '', phone: '', entity_name: '', deal_type: 'land',
  target_states: '', target_counties: '', budget_min: '', budget_max: '',
  acreage_min: '', acreage_max: '', activity_score: '50', buyer_type: 'unknown',
  intent_level: 'low', pipeline_stage: 'new_scraped', city: '', notes: '', source: 'manual',
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
  const [runningDiscovery, setRunningDiscovery] = useState(false);

  useEffect(() => {
    loadBuyers();
    // Auto-refresh every 10s to catch new ingested buyers
    const interval = setInterval(loadBuyers, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadBuyers = async () => {
    setLoading(true);
    const { data } = await supabase.from('lw_buyers').select('*').order('created_at', { ascending: false });
    setBuyers(data || []);
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
    list.sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return list;
  }, [buyers, stageFilter, typeFilter, intentFilter, stateFilter, sourceFilter, search, sortField, sortAsc]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const runDiscovery = async () => {
    setRunningDiscovery(true);
    try {
      const { error } = await supabase.functions.invoke('buyer-discovery', { body: {} });
      if (error) throw error;
      toast.success('Discovery started — results will appear as scrapes complete');
    } catch (err: any) {
      toast.error(err.message || 'Discovery failed');
    }
    setRunningDiscovery(false);
  };

  const updateStage = async (id: string, stage: string) => {
    await supabase.from('lw_buyers').update({ pipeline_stage: stage }).eq('id', id);
    toast.success(`Moved to ${stage.replace(/_/g, ' ')}`);
    loadBuyers();
  };

  const openAdd = () => { setEditId(null); setForm(emptyForm); setAddOpen(true); };
  const openEdit = (b: any) => {
    setEditId(b.id);
    setForm({
      full_name: b.full_name || '', email: b.email || '', phone: b.phone || '',
      entity_name: b.entity_name || '', deal_type: b.deal_type || 'land',
      target_states: (b.target_states || []).join(', '),
      target_counties: (b.target_counties || []).join(', '),
      budget_min: b.budget_min?.toString() || '', budget_max: b.budget_max?.toString() || '',
      acreage_min: b.acreage_min?.toString() || '', acreage_max: b.acreage_max?.toString() || '',
      activity_score: (b.activity_score || 50).toString(),
      buyer_type: b.buyer_type || 'unknown', intent_level: b.intent_level || 'low',
      pipeline_stage: b.pipeline_stage || 'new_scraped', city: b.city || '',
      notes: b.notes || '', source: b.source || 'manual',
    });
    setAddOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast.error('Name required'); return; }
    const payload: any = {
      full_name: form.full_name.trim(),
      email: form.email.trim() || null, phone: form.phone.trim() || null,
      entity_name: form.entity_name.trim() || null, deal_type: form.deal_type,
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
    };
    if (editId) {
      const { error } = await supabase.from('lw_buyers').update(payload).eq('id', editId);
      if (error) { toast.error(error.message); return; }
      toast.success('Buyer updated');
    } else {
      const { error } = await supabase.from('lw_buyers').insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success('Buyer added');
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
      {/* Pipeline Stage Bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
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
              <Button size="sm" variant="outline" onClick={runDiscovery} disabled={runningDiscovery}>
                <Zap className="h-3.5 w-3.5 mr-1" />
                {runningDiscovery ? 'Running…' : 'Run Discovery'}
              </Button>
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
                  {filtered.map(b => (
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
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label>City</Label><Input value={form.city} onChange={e => set('city', e.target.value)} /></div>
              <div className="space-y-1">
                <Label>Deal Type</Label>
                <Select value={form.deal_type} onValueChange={v => set('deal_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="land">🏞️ Land</SelectItem>
                    <SelectItem value="home">🏠 Homes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
