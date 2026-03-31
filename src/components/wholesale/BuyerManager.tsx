import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Users, Pencil, Trash2, Search, Home } from 'lucide-react';
import { toast } from 'sonner';
import BuyerInterests, { emptyInterests, type InterestsData } from './BuyerInterests';

type Buyer = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  entity_name: string | null;
  buyer_type: string | null;
  deal_type: string;
  target_states: string[];
  target_counties: string[];
  budget_min: number | null;
  budget_max: number | null;
  acreage_min: number | null;
  acreage_max: number | null;
  activity_score: number;
  purchase_count: number | null;
  status: string;
  source: string;
  notes: string | null;
  created_at: string;
  meta: any;
};

const BUYER_TYPES = [
  { key: 'unknown', label: 'Unknown' },
  { key: 'individual', label: 'Individual' },
  { key: 'llc', label: 'LLC' },
  { key: 'hedge_fund', label: '🏦 Hedge Fund' },
  { key: 'reit', label: 'REIT' },
  { key: 'developer', label: 'Developer' },
];

const DEAL_TYPES = [
  { key: 'land', label: '🏞️ Land' },
  { key: 'home', label: '🏠 Homes' },
  { key: 'multi_home', label: 'Multi-Home' },
];

const PIPELINE_STAGES = [
  { key: 'new_scraped', label: 'New / Scraped' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'warm', label: 'Subscribed' },
  { key: 'active', label: 'Active' },
  { key: 'closed', label: 'Closed' },
];

const emptyForm = {
  full_name: '',
  email: '',
  phone: '',
  entity_name: '',
  deal_types: ['land'] as string[],
  target_states: '',
  target_counties: '',
  budget_min: '',
  budget_max: '',
  acreage_min: '',
  acreage_max: '',
  activity_score: '50',
  notes: '',
  source: 'manual',
  closing_speed: '',
  contact_preference: 'email',
  website: '',
  pipeline_stage: 'new_scraped',
  buyer_type: 'unknown',
};

export default function BuyerManager() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [interests, setInterests] = useState<InterestsData>(emptyInterests);
  const [findingSeller, setFindingSeller] = useState(false);

  useEffect(() => { loadBuyers(); }, []);

  const loadBuyers = async () => {
    setLoading(true);
    const { data } = await supabase.from('lw_buyers').select('*').order('created_at', { ascending: false });
    setBuyers(data || []);
    setLoading(false);
  };

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setInterests(emptyInterests);
    setOpen(true);
  };

  const openEdit = (b: Buyer) => {
    setEditId(b.id);
    setForm({
      full_name: b.full_name,
      email: b.email || '',
      phone: b.phone || '',
      entity_name: b.entity_name || '',
      deal_types: b.meta?.deal_types || [b.deal_type || 'land'],
      target_states: b.target_states.join(', '),
      target_counties: b.target_counties.join(', '),
      budget_min: b.budget_min?.toString() || '',
      budget_max: b.budget_max?.toString() || '',
      acreage_min: b.acreage_min?.toString() || '',
      acreage_max: b.acreage_max?.toString() || '',
      activity_score: b.activity_score.toString(),
      notes: b.notes || '',
      source: b.source,
      closing_speed: b.meta?.closing_speed || '',
      contact_preference: b.meta?.contact_preference || 'email',
      website: b.meta?.website || '',
      pipeline_stage: b.meta?.pipeline_stage || (b as any).pipeline_stage || 'new_scraped',
      buyer_type: b.buyer_type || 'unknown',
    });
    setInterests(b.meta?.interests || emptyInterests);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast.error('Name is required'); return; }
    if (!form.target_states.trim()) { toast.error('At least one target state is required'); return; }
    if (!form.budget_min && !form.budget_max) { toast.error('Budget (min or max) is required for matching'); return; }
    if (interests.property_types.length === 0) { toast.error('Select at least one property type'); return; }

    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      entity_name: form.entity_name.trim() || null,
      deal_type: form.deal_types[0] || 'land',
      target_states: form.target_states.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
      target_counties: form.target_counties.split(',').map(s => s.trim()).filter(Boolean),
      budget_min: form.budget_min ? Number(form.budget_min) : null,
      budget_max: form.budget_max ? Number(form.budget_max) : null,
      acreage_min: form.acreage_min ? Number(form.acreage_min) : null,
      acreage_max: form.acreage_max ? Number(form.acreage_max) : null,
      activity_score: Number(form.activity_score) || 50,
      notes: form.notes.trim() || null,
      source: form.source,
      status: 'active',
      pipeline_stage: form.pipeline_stage,
      buyer_type: form.buyer_type,
      meta: {
        interests,
        deal_types: form.deal_types,
        closing_speed: form.closing_speed || null,
        contact_preference: form.contact_preference,
        website: form.website.trim() || null,
        pipeline_stage: form.pipeline_stage,
      },
      property_type_interest: interests.property_types,
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
    setOpen(false);
    loadBuyers();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this buyer?')) return;
    await supabase.from('lw_buyers').delete().eq('id', id);
    toast.success('Buyer deleted');
    loadBuyers();
  };

  const handleFindSeller = async () => {
    if (!form.target_states.trim()) { toast.error('Set target states first'); return; }
    setFindingSeller(true);

    try {
      const states = form.target_states.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      const counties = form.target_counties.split(',').map(s => s.trim()).filter(Boolean);

      // Build property type filter from interests
      const propTypes = interests.property_types;
      let propertyType = 'LAND';
      if (propTypes.includes('sfr')) propertyType = 'SFR';
      else if (propTypes.includes('multi_family')) propertyType = 'MULTI_FAMILY';
      else if (propTypes.includes('land')) propertyType = 'LAND';

      const params: any = {
        state: states[0] || 'TX',
        property_type: propertyType,
        limit: 25,
      };
      if (counties.length) params.county = counties[0];

      // Add distress filters based on motivation flags
      const motFlags = interests.motivation_flags || [];
      if (motFlags.includes('absentee_owner')) params.absentee_owner = true;
      if (motFlags.includes('pre_foreclosure')) params.pre_foreclosure = true;
      if (motFlags.includes('tax_delinquent')) params.tax_delinquent = true;
      if (motFlags.includes('vacant')) params.vacant = true;
      if (motFlags.includes('free_clear')) params.free_and_clear = true;

      // Price range
      if (form.budget_max) params.max_value = Math.round(Number(form.budget_max) * 1.25); // 25% buffer
      if (form.budget_min) params.min_value = Number(form.budget_min);

      // Acreage
      if (form.acreage_min) params.min_acres = Number(form.acreage_min);
      if (form.acreage_max) params.max_acres = Number(form.acreage_max);

      const res = await supabase.functions.invoke('land-reapi-search', {
        body: { action: 'search', params },
      });

      if (res.error) throw res.error;
      const result = res.data;
      toast.success(`Found ${result?.records_fetched || 0} seller leads matching buyer criteria`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to search');
    } finally {
      setFindingSeller(false);
    }
  };

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  const interestSummary = (b: Buyer) => {
    const int: InterestsData = b.meta?.interests || {};
    const tags: string[] = [];
    (int.property_types || []).forEach(pt => tags.push(pt.replace('_', ' ')));
    (int.motivation_flags || []).slice(0, 2).forEach(mf => tags.push(mf.replace('_', ' ')));
    return tags.length ? tags : null;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-4 w-4" />
          Buyer List
          <Badge variant="outline" className="ml-auto">{buyers.length} buyers</Badge>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" /> Add Buyer</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editId ? 'Edit Buyer' : 'Add New Buyer'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                {/* Contact Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Full Name *</Label>
                    <Input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="John Smith" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Entity / LLC</Label>
                    <Input value={form.entity_name} onChange={e => set('entity_name', e.target.value)} placeholder="Smith Holdings LLC" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+15551234567" />
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
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label>Source</Label>
                    <Select value={form.source} onValueChange={v => set('source', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="reapi">REAPI</SelectItem>
                        <SelectItem value="referral">Referral</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Pipeline Stage</Label>
                    <Select value={form.pipeline_stage} onValueChange={v => set('pipeline_stage', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PIPELINE_STAGES.map(ps => (
                          <SelectItem key={ps.key} value={ps.key}>{ps.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Buyer Type</Label>
                    <Select value={form.buyer_type} onValueChange={v => set('buyer_type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BUYER_TYPES.map(bt => (
                          <SelectItem key={bt.key} value={bt.key}>{bt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
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

                <div className="space-y-1.5">
                  <Label>Target States * <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                  <Input value={form.target_states} onChange={e => set('target_states', e.target.value)} placeholder="TX, FL, AZ" />
                </div>
                <div className="space-y-1.5">
                  <Label>Target Counties <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                  <Input value={form.target_counties} onChange={e => set('target_counties', e.target.value)} placeholder="Harris, Pima, Polk" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Budget Min ($)</Label>
                    <Input type="number" value={form.budget_min} onChange={e => set('budget_min', e.target.value)} placeholder="5000" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Budget Max ($)</Label>
                    <Input type="number" value={form.budget_max} onChange={e => set('budget_max', e.target.value)} placeholder="50000" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Acreage Min</Label>
                    <Input type="number" value={form.acreage_min} onChange={e => set('acreage_min', e.target.value)} placeholder="1" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Acreage Max</Label>
                    <Input type="number" value={form.acreage_max} onChange={e => set('acreage_max', e.target.value)} placeholder="40" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Activity Score (0–100)</Label>
                  <Input type="number" min={0} max={100} value={form.activity_score} onChange={e => set('activity_score', e.target.value)} />
                </div>

                {/* Buyer Interests Section */}
                <div className="border-t border-border pt-4">
                  <h3 className="text-sm font-bold mb-3">🎯 Buyer Interests & Criteria</h3>
                  <BuyerInterests interests={interests} onChange={setInterests} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>How Fast Can You Close?</Label>
                    <Input value={form.closing_speed} onChange={e => set('closing_speed', e.target.value)} placeholder="e.g. 7 days, 2 weeks" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Buyer's Website</Label>
                    <Input value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://example.com" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Cash buyer, closes fast…" />
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1" onClick={handleSave}>{editId ? 'Update Buyer' : 'Add Buyer'}</Button>
                  {editId && (
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      onClick={handleFindSeller}
                      disabled={findingSeller}
                    >
                      <Search className={`h-3.5 w-3.5 ${findingSeller ? 'animate-spin' : ''}`} />
                      {findingSeller ? 'Searching…' : 'Find a Seller'}
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {buyers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No buyers yet</p>
            <p className="text-xs mt-1">Add your first buyer to power the matching engine</p>
            <Button size="sm" className="mt-3" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" /> Add Buyer</Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>States</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Interests</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...buyers].sort((a, b) => {
                const aHedge = a.buyer_type === 'hedge_fund' ? 0 : 1;
                const bHedge = b.buyer_type === 'hedge_fund' ? 0 : 1;
                return aHedge - bHedge;
              }).map(b => {
                const tags = interestSummary(b);
                const isHedgeFund = b.buyer_type === 'hedge_fund';
                return (
                  <TableRow key={b.id} className={isHedgeFund ? 'bg-amber-500/5 border-amber-500/20' : ''}>
                    <TableCell>
                      <div>
                        <span className={`font-medium ${isHedgeFund ? 'text-amber-400' : ''}`}>
                          {isHedgeFund && '🏦 '}{b.full_name}
                        </span>
                        {b.entity_name && <span className={`text-xs block ${isHedgeFund ? 'text-amber-400/60' : 'text-muted-foreground'}`}>{b.entity_name}</span>}
                        {isHedgeFund && <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Hedge Fund</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {b.deal_type === 'land' ? '🏞️' : '🏠'} {b.deal_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{b.target_states.join(', ')}</TableCell>
                    <TableCell className="text-sm">
                      {b.budget_min || b.budget_max
                        ? `$${(b.budget_min || 0).toLocaleString()}–$${(b.budget_max || 0).toLocaleString()}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {tags ? (
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {tags.slice(0, 3).map((t, i) => (
                            <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded capitalize">{t}</span>
                          ))}
                          {tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <span className={`font-mono text-sm font-semibold ${b.activity_score >= 70 ? 'text-green-500' : b.activity_score >= 40 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                        {b.activity_score}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{b.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(b)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(b.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
