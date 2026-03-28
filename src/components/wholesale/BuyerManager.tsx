import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Users, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
];

type Buyer = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  entity_name: string | null;
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
};

const emptyForm = {
  full_name: '',
  email: '',
  phone: '',
  entity_name: '',
  deal_type: 'land',
  target_states: '',
  target_counties: '',
  budget_min: '',
  budget_max: '',
  acreage_min: '',
  acreage_max: '',
  activity_score: '50',
  notes: '',
  source: 'manual',
};

export default function BuyerManager() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

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
    setOpen(true);
  };

  const openEdit = (b: Buyer) => {
    setEditId(b.id);
    setForm({
      full_name: b.full_name,
      email: b.email || '',
      phone: b.phone || '',
      entity_name: b.entity_name || '',
      deal_type: b.deal_type,
      target_states: b.target_states.join(', '),
      target_counties: b.target_counties.join(', '),
      budget_min: b.budget_min?.toString() || '',
      budget_max: b.budget_max?.toString() || '',
      acreage_min: b.acreage_min?.toString() || '',
      acreage_max: b.acreage_max?.toString() || '',
      activity_score: b.activity_score.toString(),
      notes: b.notes || '',
      source: b.source,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast.error('Name is required'); return; }
    if (!form.target_states.trim()) { toast.error('At least one target state is required'); return; }

    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      entity_name: form.entity_name.trim() || null,
      deal_type: form.deal_type,
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

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

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
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editId ? 'Edit Buyer' : 'Add New Buyer'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Deal Type</Label>
                    <Select value={form.deal_type} onValueChange={v => set('deal_type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="land">🏞️ Land</SelectItem>
                        <SelectItem value="home">🏠 Homes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                </div>

                <div className="space-y-1.5">
                  <Label>Target States * <span className="text-muted-foreground text-xs">(comma-separated, e.g. TX, FL, AZ)</span></Label>
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

                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Cash buyer, closes fast…" />
                </div>

                <Button className="w-full" onClick={handleSave}>{editId ? 'Update Buyer' : 'Add Buyer'}</Button>
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
                <TableHead>Counties</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Acreage</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buyers.map(b => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{b.full_name}</span>
                      {b.entity_name && <span className="text-xs text-muted-foreground block">{b.entity_name}</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {b.deal_type === 'land' ? '🏞️' : '🏠'} {b.deal_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-[120px] truncate">{b.target_states.join(', ')}</TableCell>
                  <TableCell className="text-xs max-w-[150px] truncate">{b.target_counties.join(', ') || '—'}</TableCell>
                  <TableCell className="text-sm">
                    {b.budget_min || b.budget_max
                      ? `$${(b.budget_min || 0).toLocaleString()}–$${(b.budget_max || 0).toLocaleString()}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {b.acreage_min || b.acreage_max
                      ? `${b.acreage_min || 0}–${b.acreage_max || '∞'} ac`
                      : '—'}
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
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
