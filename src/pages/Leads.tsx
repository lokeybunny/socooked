import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Search, ExternalLink, MapPin, Phone, Mail, User, StickyNote, Bot } from 'lucide-react';

export default function Leads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);

  const loadLeads = async () => {
    let q = supabase
      .from('customers')
      .select('*')
      .eq('status', 'lead')
      .order('created_at', { ascending: false });

    if (filterSource !== 'all') q = q.eq('source', filterSource);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);

    const { data } = await q;
    setLeads(data || []);
    setLoading(false);
  };

  useEffect(() => { loadLeads(); }, [search, filterSource]);

  const sources = ['x', 'twitter', 'reddit', 'craigslist', 'web', 'email', 'sms', 'linkedin', 'other'];

  const promote = async (id: string) => {
    await supabase.from('customers').update({ status: 'prospect' }).eq('id', id);
    setSelected(null);
    loadLeads();
  };

  const dismiss = async (id: string) => {
    await supabase.from('customers').update({ status: 'inactive' }).eq('id', id);
    setSelected(null);
    loadLeads();
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              Leads
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {leads.length} leads extracted by Clawd Bot for review
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search leads..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All Sources" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {sources.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Cards grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leads.map(lead => (
            <button
              key={lead.id}
              onClick={() => setSelected(lead)}
              className="text-left glass-card p-4 space-y-3 hover:ring-2 hover:ring-primary/30 transition-all rounded-xl"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground truncate">{lead.full_name}</span>
                {lead.source && (
                  <span className="text-[10px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase">
                    {lead.source}
                  </span>
                )}
              </div>

              {lead.email && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{lead.email}</span>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span>{lead.phone}</span>
                </div>
              )}
              {lead.address && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{lead.address}</span>
                </div>
              )}
              {lead.notes && (
                <p className="text-xs text-muted-foreground line-clamp-2">{lead.notes}</p>
              )}

              <div className="text-[10px] text-muted-foreground">
                {new Date(lead.created_at).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>

        {leads.length === 0 && !loading && (
          <div className="text-center py-16 text-muted-foreground">
            <Bot className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No leads yet. Clawd Bot will populate them as it scans.</p>
          </div>
        )}

        {/* Detail modal */}
        {selected && (
          <Dialog open onOpenChange={() => setSelected(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  {selected.full_name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {selected.source && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded uppercase">{selected.source}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <p className="text-foreground">{selected.email || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <p className="text-foreground">{selected.phone || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Company</Label>
                    <p className="text-foreground">{selected.company || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Address</Label>
                    <p className="text-foreground">{selected.address || '—'}</p>
                  </div>
                </div>

                {selected.notes && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <StickyNote className="h-3 w-3" /> Bot Notes
                    </Label>
                    <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{selected.notes}</p>
                  </div>
                )}

                {selected.tags && selected.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selected.tags.map((t: string) => (
                      <span key={t} className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button onClick={() => promote(selected.id)} className="flex-1">Promote to Prospect</Button>
                  <Button variant="outline" onClick={() => dismiss(selected.id)} className="flex-1">Dismiss</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AppLayout>
  );
}
