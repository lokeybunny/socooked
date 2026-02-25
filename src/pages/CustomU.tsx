import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Link2, Copy, ExternalLink, Search, RefreshCw, Trash2, Send } from 'lucide-react';
import CortexTerminal from '@/components/terminal/CortexTerminal';


const CATEGORY_LABELS: Record<string, string> = {
  'digital-services': 'Digital Services',
  'brick-and-mortar': 'Brick & Mortar',
  'digital-ecommerce': 'Digital E-Commerce',
  'food-and-beverage': 'Food & Beverage',
  'mobile-services': 'Mobile Services',
  'other': 'Other',
};

function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 12; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

export default function CustomU() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const load = async () => {
    let q = supabase.from('customers').select('id, full_name, category, upload_token, email, company').order('full_name');
    if (search) q = q.ilike('full_name', `%${search}%`);
    const { data } = await q;
    setCustomers(data || []);
    setLoading(false);
  };

  useEffect(() => { setPage(0); load(); }, [search]);

  const getUploadUrl = (token: string) => {
    const base = window.location.origin;
    return `${base}/u/${token}`;
  };

  const handleGenerate = async (customerId: string) => {
    setGenerating(customerId);
    const token = generateToken();
    const { error } = await supabase.from('customers').update({ upload_token: token }).eq('id', customerId);
    if (error) { toast.error(error.message); setGenerating(null); return; }
    toast.success('Upload link created');
    setGenerating(null);
    load();
  };

  const handleRevoke = async (customerId: string) => {
    const { error } = await supabase.from('customers').update({ upload_token: null }).eq('id', customerId);
    if (error) { toast.error(error.message); return; }
    toast.success('Upload link revoked');
    load();
  };

  const handleRegenerate = async (customerId: string) => {
    setGenerating(customerId);
    const token = generateToken();
    const { error } = await supabase.from('customers').update({ upload_token: token }).eq('id', customerId);
    if (error) { toast.error(error.message); setGenerating(null); return; }
    toast.success('Upload link regenerated');
    setGenerating(null);
    load();
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(getUploadUrl(token));
    toast.success('Link copied to clipboard');
  };

  const handleSend = async (customerId: string, customerName: string) => {
    setSending(customerId);
    try {
      const { data, error } = await supabase.functions.invoke('clawd-bot/send-portal-link', {
        body: { customer_id: customerId },
      });
      if (error) { toast.error(error.message); return; }
      if (data?.error) { toast.error(data.error); return; }
      toast.success(`Portal link emailed to ${customerName}`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to send');
    } finally {
      setSending(null);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Custom-U</h1>
              <p className="text-muted-foreground mt-1">Generate custom upload links for your clients. They can upload files directly to your Google Drive.</p>
            </div>
            
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customers..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : customers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No customers found.</p>
        ) : (
          <>
            <div className="space-y-3">
              {customers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(c => (
                <div key={c.id} className="glass-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{c.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.company || CATEGORY_LABELS[c.category || 'other'] || 'Other'}
                      {c.email && ` · ${c.email}`}
                    </p>
                  </div>

                  {c.upload_token ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 bg-muted rounded-md px-3 py-1.5 text-xs font-mono text-muted-foreground max-w-[280px] truncate">
                        <Link2 className="h-3 w-3 shrink-0 text-primary" />
                        <span className="truncate">/u/{c.upload_token}</span>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => copyLink(c.upload_token)} className="gap-1.5">
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </Button>
                      <a href={getUploadUrl(c.upload_token)} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <ExternalLink className="h-3.5 w-3.5" /> Open
                        </Button>
                      </a>
                      <Button variant="default" size="sm" onClick={() => handleSend(c.id, c.full_name)} disabled={sending === c.id || !c.email} className="gap-1.5">
                        <Send className="h-3.5 w-3.5" /> {sending === c.id ? 'Sending...' : 'Send'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleRegenerate(c.id)} disabled={generating === c.id} className="gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" /> New Link
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleRevoke(c.id)} className="text-muted-foreground hover:text-destructive gap-1.5">
                        <Trash2 className="h-3.5 w-3.5" /> Revoke
                      </Button>
                    </div>
                  ) : (
                    <Button variant="default" size="sm" onClick={() => handleGenerate(c.id)} disabled={generating === c.id} className="gap-1.5">
                      <Link2 className="h-3.5 w-3.5" /> Generate Link
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {customers.length > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, customers.length)} of {customers.length}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= customers.length} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
        <CortexTerminal
          module="custom-u"
          label="Custom-U Terminal"
          hint="generate, send & revoke upload links"
          placeholder="e.g. Send Warren his upload portal link..."
          edgeFunction="custom-u-scheduler"
        />
      </div>
    </AppLayout>
  );
}
