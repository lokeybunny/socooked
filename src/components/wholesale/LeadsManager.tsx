import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Phone, Users, Search, Loader2, Eye, Pencil, Save, X, Sparkles, PhoneCall,
  Clock, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Bot, Globe
} from 'lucide-react';

interface Lead {
  id: string;
  landing_page_id: string | null;
  full_name: string;
  phone: string;
  property_address: string;
  status: string;
  email: string | null;
  timeline: string | null;
  property_condition: string | null;
  motivation: string | null;
  asking_price: number | null;
  lead_score: number | null;
  ai_notes: string | null;
  vapi_call_id: string | null;
  vapi_call_status: string | null;
  vapi_recording_url: string | null;
  notes: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

const PAGE_SIZE = 25;

const statusColors: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-500',
  contacted: 'bg-yellow-500/10 text-yellow-500',
  qualified: 'bg-green-500/10 text-green-500',
  unqualified: 'bg-muted text-muted-foreground',
  closed: 'bg-purple-500/10 text-purple-500',
};

const callStatusIcons: Record<string, JSX.Element> = {
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  calling: <PhoneCall className="h-3.5 w-3.5 text-yellow-500 animate-pulse" />,
  'in-progress': <PhoneCall className="h-3.5 w-3.5 text-blue-500 animate-pulse" />,
  ringing: <Phone className="h-3.5 w-3.5 text-blue-500 animate-bounce" />,
  completed: <CheckCircle className="h-3.5 w-3.5 text-green-500" />,
  failed: <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
};

export default function LeadsManager() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [landingPages, setLandingPages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPageId, setFilterPageId] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Lead>>({});
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  useEffect(() => {
    loadLeads();

    // Subscribe to realtime changes so webhook updates appear automatically
    const channel = supabase
      .channel('lw_landing_leads_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lw_landing_leads' },
        () => { loadLeads(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadLeads = async () => {
    setLoading(true);
    const [leadsRes, pagesRes] = await Promise.all([
      supabase.from('lw_landing_leads').select('*').order('created_at', { ascending: false }),
      supabase.from('lw_landing_pages').select('id, client_name, slug'),
    ]);
    setLeads((leadsRes.data as Lead[]) || []);
    const pageMap: Record<string, string> = {};
    (pagesRes.data || []).forEach((p: any) => { pageMap[p.id] = p.client_name || p.slug; });
    setLandingPages(pageMap);
    setLoading(false);
  };

  const filtered = leads.filter(l => {
    if (filterPageId !== 'all' && l.landing_page_id !== filterPageId) return false;
    if (!search) return true;
    return l.full_name.toLowerCase().includes(search.toLowerCase()) ||
      l.property_address.toLowerCase().includes(search.toLowerCase()) ||
      l.phone.includes(search);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openDetail = (lead: Lead) => {
    setSelectedLead(lead);
    setEditForm({ ...lead });
    setEditing(false);
  };

  const saveLead = async () => {
    if (!selectedLead) return;
    const { error } = await supabase.from('lw_landing_leads').update({
      full_name: editForm.full_name,
      phone: editForm.phone,
      property_address: editForm.property_address,
      email: editForm.email,
      status: editForm.status,
      timeline: editForm.timeline,
      property_condition: editForm.property_condition,
      motivation: editForm.motivation,
      asking_price: editForm.asking_price,
      lead_score: editForm.lead_score,
      notes: editForm.notes,
      ai_notes: editForm.ai_notes,
    }).eq('id', selectedLead.id);

    if (error) {
      toast.error('Failed to save');
    } else {
      toast.success('Lead updated');
      setEditing(false);
      loadLeads();
      setSelectedLead({ ...selectedLead, ...editForm } as Lead);
    }
  };

  const analyzeLead = async (lead: Lead) => {
    setAnalyzing(lead.id);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await supabase.functions.invoke('ai-assistant', {
        body: {
          prompt: `Analyze this real estate lead and extract structured information. Return a JSON object with these fields:
- lead_score (0-100, based on motivation, timeline, and engagement)
- property_condition (one of: "Good", "Fair", "Needs Work", "Major Repairs")
- timeline (one of: "ASAP", "1-3 Months", "Flexible", "Just Exploring")
- motivation (brief description)
- email (if found)
- asking_price (number if mentioned, null otherwise)
- summary (2-3 bullet points summarizing key findings)

Lead data:
Name: ${lead.full_name}
Phone: ${lead.phone}
Property: ${lead.property_address}
Status: ${lead.status}
Current AI Notes: ${lead.ai_notes || 'None'}
Current Notes: ${lead.notes || 'None'}
Vapi Call Status: ${lead.vapi_call_status || 'None'}
Meta: ${JSON.stringify(lead.meta || {})}`,
        },
      });

      if (res.error) throw res.error;

      // Try to parse JSON from response
      const text = typeof res.data === 'string' ? res.data : res.data?.response || res.data?.text || JSON.stringify(res.data);
      let parsed: any = {};
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch {}
      }

      const updates: any = {};
      if (parsed.lead_score != null) updates.lead_score = parsed.lead_score;
      if (parsed.property_condition) updates.property_condition = parsed.property_condition;
      if (parsed.timeline) updates.timeline = parsed.timeline;
      if (parsed.motivation) updates.motivation = parsed.motivation;
      if (parsed.email) updates.email = parsed.email;
      if (parsed.asking_price) updates.asking_price = parsed.asking_price;
      if (parsed.summary) {
        const existingNotes = lead.ai_notes || '';
        const summaryBullets = Array.isArray(parsed.summary)
          ? parsed.summary.map((s: string) => `• ${s}`).join('\n')
          : `• ${parsed.summary}`;
        updates.ai_notes = existingNotes
          ? existingNotes + '\n\nAI Analysis:\n' + summaryBullets
          : 'AI Analysis:\n' + summaryBullets;
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('lw_landing_leads').update(updates).eq('id', lead.id);
        toast.success('Lead analyzed and updated');
        loadLeads();
        if (selectedLead?.id === lead.id) {
          setSelectedLead({ ...lead, ...updates });
          setEditForm({ ...editForm, ...updates });
        }
      } else {
        toast('No new data extracted');
      }
    } catch (err: any) {
      toast.error('Analysis failed: ' + (err.message || 'Unknown error'));
    } finally {
      setAnalyzing(null);
    }
  };

  const retriggerCall = async (leadId: string) => {
    toast.loading('Triggering call...', { id: 'call' });
    try {
      const res = await supabase.functions.invoke('vapi-outbound', {
        body: { action: 'trigger_call', lead_id: leadId },
      });
      if (res.error) throw res.error;
      toast.success('Call initiated!', { id: 'call' });
      loadLeads();
    } catch (err: any) {
      toast.error('Call failed: ' + (err.message || 'Unknown'), { id: 'call' });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-4 w-4" />
            Landing Page Leads
            <Badge variant="outline" className="ml-auto">{filtered.length} leads</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name, address, or phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {Object.keys(landingPages).length > 1 && (
              <Select value={filterPageId} onValueChange={v => { setFilterPageId(v); setPage(1); }}>
                <SelectTrigger className="w-[200px]">
                  <Globe className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="All Pages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Landing Pages</SelectItem>
                  {Object.entries(landingPages).map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No leads yet</p>
              <p className="text-xs mt-1">Leads will appear here when visitors submit your landing page forms</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                   <TableRow>
                     <TableHead>Name</TableHead>
                     <TableHead>Source</TableHead>
                     <TableHead>Phone</TableHead>
                     <TableHead>Property</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead>Call</TableHead>
                     <TableHead>Score</TableHead>
                     <TableHead>Date</TableHead>
                     <TableHead className="text-right">Actions</TableHead>
                   </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(lead => (
                    <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(lead)}>
                     <TableCell className="font-medium">{lead.full_name}</TableCell>
                     <TableCell>
                       <Badge variant="outline" className="text-[10px] max-w-[120px] truncate">
                         {lead.landing_page_id ? (landingPages[lead.landing_page_id] || 'Unknown') : 'Direct'}
                       </Badge>
                     </TableCell>
                     <TableCell>
                        <a href={`tel:${lead.phone}`} className="text-primary hover:underline text-sm" onClick={e => e.stopPropagation()}>
                          {lead.phone}
                        </a>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{lead.property_address}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${statusColors[lead.status] || ''}`}>
                          {lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {callStatusIcons[lead.vapi_call_status || 'pending'] || callStatusIcons.pending}
                          <span className="text-[10px] text-muted-foreground">{lead.vapi_call_status || 'pending'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {lead.lead_score ? (
                          <span className={`font-mono text-sm font-semibold ${lead.lead_score >= 70 ? 'text-green-500' : lead.lead_score >= 40 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                            {lead.lead_score}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => analyzeLead(lead)} disabled={analyzing === lead.id}>
                            {analyzing === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-purple-500" />}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => retriggerCall(lead.id)}>
                            <PhoneCall className="h-3.5 w-3.5 text-blue-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
                  <div className="flex gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="outline" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Lead Detail Modal */}
      <Dialog open={!!selectedLead} onOpenChange={open => { if (!open) setSelectedLead(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {editing ? 'Edit Lead' : 'Lead Detail'}
              <div className="ml-auto flex gap-1">
                {!editing ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => selectedLead && analyzeLead(selectedLead)} disabled={analyzing === selectedLead?.id}>
                      {analyzing === selectedLead?.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1 text-purple-500" />}
                      Analyze
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" onClick={saveLead}><Save className="h-3.5 w-3.5 mr-1" /> Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /></Button>
                  </>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-4 mt-2">
              {/* Source Landing Page */}
              <div className="rounded-lg border p-3 flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Source:</span>
                <Badge variant="outline">
                  {selectedLead.landing_page_id ? (landingPages[selectedLead.landing_page_id] || 'Unknown Page') : 'Direct Submission'}
                </Badge>
              </div>
              {/* Contact Info */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Full Name</Label>
                  {editing ? (
                    <Input value={editForm.full_name || ''} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} />
                  ) : (
                    <p className="font-medium">{selectedLead.full_name}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  {editing ? (
                    <Input value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                  ) : (
                    <p><a href={`tel:${selectedLead.phone}`} className="text-primary hover:underline">{selectedLead.phone}</a></p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  {editing ? (
                    <Input value={editForm.email || ''} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                  ) : (
                    <p>{selectedLead.email || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  {editing ? (
                    <Select value={editForm.status || 'new'} onValueChange={v => setEditForm({ ...editForm, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="qualified">Qualified</SelectItem>
                        <SelectItem value="unqualified">Unqualified</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge className={statusColors[selectedLead.status] || ''}>{selectedLead.status}</Badge>
                  )}
                </div>
              </div>

              {/* Property Info */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Property Address</Label>
                  {editing ? (
                    <Input value={editForm.property_address || ''} onChange={e => setEditForm({ ...editForm, property_address: e.target.value })} />
                  ) : (
                    <p>{selectedLead.property_address}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Property Condition</Label>
                  {editing ? (
                    <Select value={editForm.property_condition || ''} onValueChange={v => setEditForm({ ...editForm, property_condition: v })}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Good">Good</SelectItem>
                        <SelectItem value="Fair">Fair</SelectItem>
                        <SelectItem value="Needs Work">Needs Work</SelectItem>
                        <SelectItem value="Major Repairs">Major Repairs</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p>{selectedLead.property_condition || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Timeline</Label>
                  {editing ? (
                    <Select value={editForm.timeline || ''} onValueChange={v => setEditForm({ ...editForm, timeline: v })}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ASAP">ASAP</SelectItem>
                        <SelectItem value="1-3 Months">1-3 Months</SelectItem>
                        <SelectItem value="Flexible">Flexible</SelectItem>
                        <SelectItem value="Just Exploring">Just Exploring</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p>{selectedLead.timeline || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Motivation</Label>
                  {editing ? (
                    <Input value={editForm.motivation || ''} onChange={e => setEditForm({ ...editForm, motivation: e.target.value })} />
                  ) : (
                    <p>{selectedLead.motivation || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Asking Price</Label>
                  {editing ? (
                    <Input type="number" value={editForm.asking_price || ''} onChange={e => setEditForm({ ...editForm, asking_price: e.target.value ? Number(e.target.value) : null })} />
                  ) : (
                    <p>{selectedLead.asking_price ? `$${Number(selectedLead.asking_price).toLocaleString()}` : '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Lead Score</Label>
                  {editing ? (
                    <Input type="number" min={0} max={100} value={editForm.lead_score || ''} onChange={e => setEditForm({ ...editForm, lead_score: e.target.value ? Number(e.target.value) : null })} />
                  ) : (
                    <p className={`font-mono font-semibold ${(selectedLead.lead_score || 0) >= 70 ? 'text-green-500' : (selectedLead.lead_score || 0) >= 40 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                      {selectedLead.lead_score || '—'}
                    </p>
                  )}
                </div>
              </div>

              {/* Vapi Call Status */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">AI Call Status</span>
                  <div className="flex items-center gap-1.5 ml-auto">
                    {callStatusIcons[selectedLead.vapi_call_status || 'pending']}
                    <span className="text-xs">{selectedLead.vapi_call_status || 'pending'}</span>
                  </div>
                </div>
                {selectedLead.vapi_call_status !== 'completed' && (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => retriggerCall(selectedLead.id)}>
                    <PhoneCall className="h-3.5 w-3.5 mr-1" /> {selectedLead.vapi_call_status === 'pending' ? 'Trigger Call' : 'Retry Call'}
                  </Button>
                )}
              </div>

              {/* AI Notes */}
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-purple-500" /> AI Notes
                </Label>
                {editing ? (
                  <Textarea
                    value={editForm.ai_notes || ''}
                    onChange={e => setEditForm({ ...editForm, ai_notes: e.target.value })}
                    rows={6}
                    className="font-mono text-xs"
                  />
                ) : (
                  <pre className="mt-1 text-xs bg-muted/50 rounded-lg p-3 whitespace-pre-wrap font-mono max-h-[200px] overflow-y-auto">
                    {selectedLead.ai_notes || 'No AI notes yet. Click "Analyze" or wait for the Vapi call to complete.'}
                  </pre>
                )}
              </div>

              {/* Call Recording Download */}
              {selectedLead.vapi_recording_url && (
                <div>
                  <a
                    href={selectedLead.vapi_recording_url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
                  >
                    <Phone className="h-4 w-4" />
                    Download Call Recording
                  </a>
                </div>
              )}

              {/* Manual Notes */}
              <div>
                <Label className="text-xs text-muted-foreground">Notes</Label>
                {editing ? (
                  <Textarea
                    value={editForm.notes || ''}
                    onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                    rows={3}
                  />
                ) : (
                  <p className="text-sm mt-1">{selectedLead.notes || '—'}</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
