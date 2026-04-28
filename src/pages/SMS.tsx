import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { MessageSquare, Send, Plus, Trash2, Loader2, Megaphone, FileText, Inbox, Workflow } from 'lucide-react';
import PowerDialSMSInbox from '@/components/powerdial/PowerDialSMSInbox';
import SequenceBuilder from '@/components/sms/SequenceBuilder';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Template = { id: string; name: string; body: string };
type Campaign = { id: string; name: string; body: string; status: string; total_recipients: number; sent_count: number; failed_count: number; created_at: string };
type SequenceLite = { id: string; name: string; is_active: boolean };

function extractPhones(raw: string): { phone: string; name: string | null }[] {
  const phoneRegex = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
  const seen = new Set<string>();
  const out: { phone: string; name: string | null }[] = [];
  for (const line of raw.split('\n')) {
    const matches = line.match(phoneRegex);
    if (!matches) continue;
    for (const m of matches) {
      const digits = m.replace(/\D/g, '');
      const norm = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
      if (norm.length !== 10 || seen.has(norm)) continue;
      seen.add(norm);
      const idx = line.indexOf(m);
      const before = line.slice(0, idx).replace(/[^a-zA-Z\s&'.-]/g, '').trim();
      out.push({ phone: `+1${norm}`, name: before.length >= 2 ? before : null });
    }
  }
  return out;
}

export default function SMS() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tplName, setTplName] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [campName, setCampName] = useState('');
  const [campBody, setCampBody] = useState('');
  const [campPhones, setCampPhones] = useState('');
  const [sending, setSending] = useState(false);

  const load = async () => {
    const [t, c] = await Promise.all([
      supabase.from('sms_templates').select('*').order('created_at', { ascending: false }),
      supabase.from('sms_campaigns').select('*').order('created_at', { ascending: false }),
    ]);
    setTemplates((t.data as Template[]) || []);
    setCampaigns((c.data as Campaign[]) || []);
  };

  useEffect(() => { load(); }, []);

  const saveTemplate = async () => {
    if (!tplName.trim() || !tplBody.trim()) return toast.error('Name and body required');
    const { error } = await supabase.from('sms_templates').insert({ name: tplName, body: tplBody });
    if (error) toast.error(error.message);
    else { toast.success('Template saved'); setTplName(''); setTplBody(''); load(); }
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from('sms_templates').delete().eq('id', id);
    load();
  };

  const sendBlast = async () => {
    const recips = extractPhones(campPhones);
    if (!campName.trim() || !campBody.trim() || recips.length === 0) {
      return toast.error('Need name, body, and at least 1 valid phone');
    }
    if (!confirm(`Send "${campName}" to ${recips.length} recipient(s)?`)) return;

    setSending(true);
    try {
      const { data: camp, error: cErr } = await supabase
        .from('sms_campaigns')
        .insert({ name: campName, body: campBody, status: 'sending', total_recipients: recips.length, started_at: new Date().toISOString() })
        .select().single();
      if (cErr || !camp) throw cErr;

      let sent = 0, failed = 0;
      for (const r of recips) {
        const personalized = campBody.replace(/\{first_name\}/gi, r.name?.split(' ')[0] || 'there');
        const { data, error } = await supabase.functions.invoke('powerdial-sms', {
          body: { action: 'send', to: r.phone, body: personalized },
        });
        const ok = !error && (data as any)?.ok;
        await supabase.from('sms_campaign_recipients').insert({
          campaign_id: camp.id,
          phone: r.phone,
          contact_name: r.name,
          status: ok ? 'sent' : 'failed',
          error: ok ? null : ((data as any)?.error || error?.message || 'unknown'),
          external_id: (data as any)?.id || null,
          sent_at: new Date().toISOString(),
        });
        if (ok) sent++; else failed++;
        await new Promise(r => setTimeout(r, 500)); // throttle
      }
      await supabase.from('sms_campaigns').update({
        status: 'completed', sent_count: sent, failed_count: failed, completed_at: new Date().toISOString(),
      }).eq('id', camp.id);
      toast.success(`Blast complete: ${sent} sent, ${failed} failed`);
      setCampName(''); setCampBody(''); setCampPhones('');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Blast failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-400/20"><MessageSquare className="h-5 w-5 text-emerald-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-foreground">SMS</h1>
            <p className="text-xs text-muted-foreground">Inbox · Blasts · Templates (VoidFix gateway)</p>
          </div>
        </div>

        <Tabs defaultValue="inbox">
          <TabsList>
            <TabsTrigger value="inbox"><Inbox className="h-3.5 w-3.5 mr-1" /> Inbox</TabsTrigger>
            <TabsTrigger value="blast"><Megaphone className="h-3.5 w-3.5 mr-1" /> New Blast</TabsTrigger>
            <TabsTrigger value="campaigns"><Send className="h-3.5 w-3.5 mr-1" /> Campaigns</TabsTrigger>
            <TabsTrigger value="templates"><FileText className="h-3.5 w-3.5 mr-1" /> Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="inbox"><PowerDialSMSInbox /></TabsContent>

          <TabsContent value="blast">
            <div className="glass-card p-5 space-y-4 max-w-2xl">
              <div>
                <Label>Campaign Name</Label>
                <Input value={campName} onChange={e => setCampName(e.target.value)} placeholder="e.g. April Realtor Outreach" />
              </div>
              <div>
                <Label>Message Body</Label>
                <Textarea
                  value={campBody}
                  onChange={e => setCampBody(e.target.value)}
                  rows={4}
                  placeholder="Hi {first_name}, this is Warren — quick question about your listings…"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Use {'{first_name}'} for personalization.</p>
                {templates.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {templates.map(t => (
                      <Button key={t.id} size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setCampBody(t.body)}>
                        {t.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label>Recipients (one phone per line, optionally with name)</Label>
                <Textarea
                  value={campPhones}
                  onChange={e => setCampPhones(e.target.value)}
                  rows={6}
                  placeholder={"7025551234, John Smith\n+18005551111, Jane Doe"}
                />
                <p className="text-[10px] text-muted-foreground mt-1">{extractPhones(campPhones).length} valid number(s) detected</p>
              </div>
              <Button onClick={sendBlast} disabled={sending} className="bg-emerald-500 hover:bg-emerald-600">
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send Blast
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="campaigns">
            <div className="glass-card p-4">
              <ScrollArea className="h-[500px]">
                {campaigns.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-8">No campaigns yet</p>
                ) : (
                  <div className="space-y-2">
                    {campaigns.map(c => (
                      <div key={c.id} className="border border-border rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{c.name}</span>
                          <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate">{c.body}</p>
                        <div className="flex gap-3 mt-2 text-[11px] text-muted-foreground">
                          <span>Total: {c.total_recipients}</span>
                          <span className="text-emerald-400">Sent: {c.sent_count}</span>
                          <span className="text-red-400">Failed: {c.failed_count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="templates">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-1"><Plus className="h-4 w-4" /> New Template</h3>
                <Input placeholder="Name" value={tplName} onChange={e => setTplName(e.target.value)} />
                <Textarea placeholder="Body" rows={5} value={tplBody} onChange={e => setTplBody(e.target.value)} />
                <Button onClick={saveTemplate} size="sm">Save Template</Button>
              </div>
              <div className="glass-card p-4">
                <h3 className="text-sm font-semibold mb-3">Saved ({templates.length})</h3>
                <ScrollArea className="h-[400px]">
                  {templates.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">No templates yet</p>
                  ) : (
                    <div className="space-y-2">
                      {templates.map(t => (
                        <div key={t.id} className="border border-border rounded p-3 flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{t.name}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">{t.body}</p>
                          </div>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400" onClick={() => deleteTemplate(t.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
