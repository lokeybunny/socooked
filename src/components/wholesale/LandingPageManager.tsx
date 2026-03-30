import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uploadToStorage } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Plus, ExternalLink, Trash2, Loader2, Copy, Globe, Eye, Pencil, X, Save,
  ChevronDown, ChevronUp, Upload, ImageIcon, DollarSign, Mail, Send, ShieldCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface LandingPageRow {
  id: string;
  slug: string;
  client_name: string;
  tagline: string;
  headline: string;
  sub_headline: string | null;
  photo_url: string | null;
  logo_url: string | null;
  accent_color: string;
  phone: string | null;
  email: string | null;
  reviews: unknown;
  meta: unknown;
  is_active: boolean;
  created_at: string;
  vapi_credit_balance_cents: number;
  vapi_total_spent_cents: number;
}

interface LeadRow {
  id: string;
  landing_page_id: string | null;
  full_name: string;
  phone: string;
  property_address: string;
  status: string;
  created_at: string;
}

const EMPTY_PAGE = {
  slug: '',
  client_name: '',
  tagline: 'We Buy Houses Fast. Cash Offers in 24 Hours.',
  headline: 'Get a Fair Cash Offer for Your Home Today',
  sub_headline: 'No inspections. No appraisals. No hassle. Close on your timeline.',
  photo_url: '',
  logo_url: '',
  accent_color: '#2563eb',
  phone: '',
  email: '',
  client_password: '',
};

export default function LandingPageManager() {
  const navigate = useNavigate();
  const [pages, setPages] = useState<LandingPageRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_PAGE });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedLeads, setExpandedLeads] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [pRes, lRes] = await Promise.all([
      supabase.from('lw_landing_pages').select('*').order('created_at', { ascending: false }),
      supabase.from('lw_landing_leads').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    setPages((pRes.data as LandingPageRow[] | null) || []);
    setLeads((lRes.data as LeadRow[] | null) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleCreate = async () => {
    if (!form.client_name.trim()) { toast.error('Client name is required'); return; }
    const slug = form.slug.trim() || slugify(form.client_name);
    setCreating(true);

    const { data: insertedPage, error } = await supabase.from('lw_landing_pages').insert({
      slug,
      client_name: form.client_name.trim(),
      tagline: form.tagline,
      headline: form.headline,
      sub_headline: form.sub_headline || null,
      photo_url: form.photo_url || null,
      logo_url: form.logo_url || null,
      accent_color: form.accent_color,
      phone: form.phone || null,
      email: form.email || null,
    }).select('id').single();

    if (error) {
      setCreating(false);
      toast.error(error.message.includes('duplicate') ? 'That slug is already taken' : error.message);
      return;
    }

    // If email + password provided, create client account
    if (form.email.trim() && form.client_password.trim() && insertedPage) {
      const { data: result, error: fnErr } = await supabase.functions.invoke('create-client-account', {
        body: {
          email: form.email.trim(),
          password: form.client_password.trim(),
          landing_page_id: insertedPage.id,
        },
      });
      if (fnErr) {
        toast.error('Page created but client account failed: ' + fnErr.message);
      } else {
        toast.success('Landing page + client account created');
      }
    } else {
      toast.success('Landing page created');
    }

    setCreating(false);
    setShowCreate(false);
    setForm({ ...EMPTY_PAGE });
    load();
  };

  const handleUpdate = async (id: string) => {
    const slug = form.slug.trim() || slugify(form.client_name);
    const { error } = await supabase.from('lw_landing_pages').update({
      slug,
      client_name: form.client_name.trim(),
      tagline: form.tagline,
      headline: form.headline,
      sub_headline: form.sub_headline || null,
      photo_url: form.photo_url || null,
      logo_url: form.logo_url || null,
      accent_color: form.accent_color,
      phone: form.phone || null,
      email: form.email || null,
    }).eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }

    // If email + password provided, create/update client auth account
    if (form.email.trim() && form.client_password.trim()) {
      const { error: fnErr } = await supabase.functions.invoke('create-client-account', {
        body: {
          email: form.email.trim(),
          password: form.client_password.trim(),
          landing_page_id: id,
        },
      });
      if (fnErr) {
        toast.error('Page updated but client account failed: ' + fnErr.message);
      } else {
        toast.success('Updated + client credentials synced');
        setEditingId(null);
        load();
        return;
      }
    }

    toast.success('Updated');
    setEditingId(null);
    load();
  };

  const toggleActive = async (p: LandingPageRow) => {
    const newActive = !p.is_active;
    await supabase.from('lw_landing_pages').update({ is_active: newActive }).eq('id', p.id);

    // When deactivating a landing page, also disable the client's auth account
    if (!newActive && p.email) {
      try {
        await supabase.functions.invoke('create-client-account', {
          body: { action: 'deactivate', email: p.email },
        });
        toast.success('Page deactivated & client login disabled');
      } catch {
        toast.success('Page deactivated (client login update failed)');
      }
    } else if (newActive && p.email) {
      // Re-activate user when page goes active again
      try {
        await supabase.functions.invoke('create-client-account', {
          body: { action: 'activate', email: p.email },
        });
        toast.success('Page activated & client login enabled');
      } catch {
        toast.success('Page activated (client login update failed)');
      }
    }
    load();
  };

  const deletePage = async (id: string) => {
    if (!confirm('Delete this landing page?')) return;
    await supabase.from('lw_landing_pages').delete().eq('id', id);
    toast.success('Deleted');
    load();
  };

  const copyUrl = (slug: string) => {
    const url = `${window.location.origin}/sell/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied');
  };

  const pageLeads = (pageId: string) => leads.filter((l) => l.landing_page_id === pageId);

  const startEdit = (p: LandingPageRow) => {
    setEditingId(p.id);
    setForm({
      slug: p.slug,
      client_name: p.client_name,
      tagline: p.tagline,
      headline: p.headline,
      sub_headline: p.sub_headline || '',
      photo_url: p.photo_url || '',
      logo_url: p.logo_url || '',
      accent_color: p.accent_color,
      phone: p.phone || '',
      email: p.email || '',
      client_password: '',
    });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const ImageUploadField = ({ value, onChange, label, folder }: { value: string; onChange: (url: string) => void; label: string; folder: string }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
      setUploading(true);
      try {
        const url = await uploadToStorage(file, { category: 'landing-pages', customerName: folder, source: 'admin' });
        onChange(url);
        toast.success('Uploaded');
      } catch (err: any) {
        toast.error(err.message || 'Upload failed');
      }
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    };

    return (
      <div className="mt-1 space-y-2">
        {value && (
          <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted">
            <img src={value} alt={label} className="w-full h-full object-cover" />
            <button onClick={() => onChange('')} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 hover:bg-black/80">
              <X className="h-3 w-3 text-white" />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {label}
          </Button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="...or paste URL" className="text-xs h-8" />
      </div>
    );
  };

  const formFieldsJsx = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label className="text-xs">Client / Brand Name *</Label>
        <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} placeholder="ABC Home Buyers" className="mt-1" />
      </div>
      <div>
        <Label className="text-xs">URL Slug</Label>
        <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="abc-home-buyers" className="mt-1" />
      </div>
      <div>
        <Label className="text-xs">Accent Color</Label>
        <div className="flex gap-2 mt-1">
          <input type="color" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="h-9 w-12 rounded border cursor-pointer" />
          <Input value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="flex-1" />
        </div>
      </div>
      <div className="sm:col-span-2">
        <Label className="text-xs">Headline</Label>
        <Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} className="mt-1" />
      </div>
      <div className="sm:col-span-2">
        <Label className="text-xs">Sub-headline</Label>
        <Input value={form.sub_headline} onChange={(e) => setForm({ ...form, sub_headline: e.target.value })} className="mt-1" />
      </div>
      <div>
        <Label className="text-xs">Phone</Label>
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" className="mt-1" />
      </div>
      <div>
        <Label className="text-xs">Email (Client Login Username)</Label>
        <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="info@company.com" className="mt-1" />
      </div>
      <div>
        <Label className="text-xs">Client Password</Label>
        <Input type="password" value={form.client_password} onChange={(e) => setForm({ ...form, client_password: e.target.value })} placeholder="Set client portal password" className="mt-1" />
        <p className="text-[10px] text-muted-foreground mt-0.5">Email + password give client access to /client-login portal</p>
      </div>
      <div>
        <Label className="text-xs">Photo</Label>
        <ImageUploadField
          value={form.photo_url}
          onChange={(url) => setForm({ ...form, photo_url: url })}
          label="Upload Photo"
          folder="photos"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Seller Landing Pages</h3>
          <p className="text-xs text-muted-foreground">Create branded pages to capture home seller leads</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> New Page</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create Landing Page</DialogTitle></DialogHeader>
            {formFieldsJsx}
            <Button onClick={handleCreate} disabled={creating} className="mt-2 w-full">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Page'}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {pages.length === 0 && (
        <div className="glass-card p-8 text-center">
          <Globe className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No landing pages yet. Create one to start capturing seller leads.</p>
        </div>
      )}

      {pages.map((p) => {
        const pLeads = pageLeads(p.id);
        const isEditing = editingId === p.id;
        const isLeadsExpanded = expandedLeads === p.id;

        return (
          <div key={p.id} className="glass-card p-4 space-y-3">
            {isEditing ? (
              <>
                {formFieldsJsx}
                <div className="flex items-center gap-2 justify-between mt-2">
                  <EmailComposeButton email={form.email} clientName={form.client_name} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5 mr-1" /> Cancel</Button>
                    <Button size="sm" onClick={() => handleUpdate(p.id)}><Save className="h-3.5 w-3.5 mr-1" /> Save</Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ background: p.accent_color }}>
                      {p.client_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{p.client_name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${p.is_active ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-500'}`}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">/sell/{p.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyUrl(p.slug)} title="Copy link"><Copy className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" asChild title="Preview">
                      <a href={`/sell/${p.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(p)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-[10px] border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => window.open(`/client-dashboard?admin_view=${p.id}`, '_blank')}
                      title="View client dashboard as admin"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      View as Admin
                    </Button>
                    <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} className="ml-1" />
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deletePage(p.id)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>

                {/* Credits + Leads section */}
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Phone Credit:</span>
                    <span className={`font-bold ${(p.vapi_credit_balance_cents || 0) <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      ${((p.vapi_credit_balance_cents || 0) / 100).toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-muted-foreground">Spent:</span>
                    <span className="font-medium text-foreground">${((p.vapi_total_spent_cents || 0) / 100).toFixed(2)}</span>
                  </div>
                  <CreditTopUp
                    pageId={p.id}
                    currentBalance={p.vapi_credit_balance_cents || 0}
                    onUpdated={load}
                  />
                </div>

                <button onClick={() => setExpandedLeads(isLeadsExpanded ? null : p.id)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition w-full">
                  {isLeadsExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  <span className="font-medium">{pLeads.length} lead{pLeads.length !== 1 ? 's' : ''}</span>
                </button>
                {isLeadsExpanded && pLeads.length > 0 && (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Phone</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Address</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pLeads.map((l) => (
                          <tr key={l.id} className="border-t border-border">
                            <td className="px-3 py-2 text-foreground font-medium">{l.full_name}</td>
                            <td className="px-3 py-2 text-foreground">{l.phone}</td>
                            <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell truncate max-w-[200px]">{l.property_address}</td>
                            <td className="px-3 py-2 text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CreditTopUp({ pageId, currentBalance, onUpdated }: { pageId: string; currentBalance: number; onUpdated: () => void }) {
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const handleAdd = async () => {
    const dollars = parseFloat(amount);
    if (!dollars || dollars <= 0) { toast.error('Enter a valid dollar amount'); return; }
    setSaving(true);
    const addCents = Math.round(dollars * 100);
    const { error } = await supabase
      .from('lw_landing_pages')
      .update({ vapi_credit_balance_cents: currentBalance + addCents } as any)
      .eq('id', pageId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Added $${dollars.toFixed(2)} credit`);
      setAmount('');
      setOpen(false);
      onUpdated();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1">
          <DollarSign className="h-3 w-3" /> Add Credit
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <p className="text-xs font-medium mb-2">Add Phone Credit ($)</p>
        <div className="flex gap-2">
          <Input
            type="number"
            min="1"
            step="1"
            placeholder="20"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="h-8 text-sm"
          />
          <Button size="sm" className="h-8 px-3" onClick={handleAdd} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
          </Button>
        </div>
        <div className="flex gap-1.5 mt-2">
          {[10, 20, 50].map(v => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              className="text-[10px] bg-muted px-2 py-1 rounded hover:bg-muted-foreground/20 transition-colors"
            >
              ${v}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EmailComposeButton({ email, clientName }: { email: string; clientName: string }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const handleOpen = () => {
    setSubject('');
    setBody('');
    setOpen(true);
  };

  const handleSend = async () => {
    if (!email.trim()) { toast.error('No email address set for this client'); return; }
    if (!subject.trim()) { toast.error('Subject is required'); return; }
    setSending(true);
    const { error } = await supabase.functions.invoke('gmail-api', {
      body: { action: 'send', to: email.trim(), subject: subject.trim(), body: body.trim() },
    });
    setSending(false);
    if (error) {
      toast.error('Failed to send: ' + error.message);
    } else {
      toast.success('Email sent to ' + email);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleOpen} disabled={!email.trim()}>
          <Mail className="h-3.5 w-3.5" /> Email Client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Send Email</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">To</Label>
            <Input value={email} disabled className="mt-1 bg-muted" />
          </div>
          <div>
            <Label className="text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line..." className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Message</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message..." rows={6} className="mt-1" />
          </div>
          <Button onClick={handleSend} disabled={sending} className="w-full gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Email
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
