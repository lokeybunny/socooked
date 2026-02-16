import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Plus, MessageSquare, FileText, Send, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { CategoryGate, useCategoryGate } from '@/components/CategoryGate';

export default function Threads() {
  const categoryGate = useCategoryGate();
  const [threads, setThreads] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [form, setForm] = useState({ customer_id: '', channel: 'chat', raw_transcript: '' });

  const load = async () => {
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from('conversation_threads').select('*, customers(full_name, email)').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, full_name, email'),
    ]);
    setThreads(t || []);
    setCustomers(c || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('conversation_threads').insert([form]);
    if (error) { toast.error(error.message); return; }
    toast.success('Thread created');
    setDialogOpen(false);
    setForm({ customer_id: '', channel: 'chat', raw_transcript: '' });
    load();
  };

  const analyzeThread = async (thread: any) => {
    setProcessing(thread.id);
    try {
      const res = await supabase.functions.invoke('clawdbot/analyze-thread', {
        body: { thread_id: thread.id, customer_id: thread.customer_id, transcript: thread.raw_transcript || '' },
      });
      if (res.error) throw res.error;
      const result = res.data;
      await supabase.from('conversation_threads').update({ status: result.status, summary: result.summary }).eq('id', thread.id);
      toast.success(`Analysis complete: ${result.status.replace(/_/g, ' ')}`);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Analysis failed');
    } finally {
      setProcessing(null);
    }
  };

  const generateDocs = async (thread: any) => {
    setProcessing(thread.id);
    try {
      await Promise.all([
        supabase.functions.invoke('clawdbot/generate-resume', {
          body: { thread_id: thread.id, customer_id: thread.customer_id, resume_style: 'modern', transcript: thread.raw_transcript || '' },
        }),
        supabase.functions.invoke('clawdbot/generate-contract', {
          body: { thread_id: thread.id, customer_id: thread.customer_id, contract_template: 'resume_service_v1', terms: { price: 400, deposit: 200, revisions_policy: '2 free revisions' }, transcript: thread.raw_transcript || '' },
        }),
      ]);
      await supabase.from('documents').insert([
        { customer_id: thread.customer_id, thread_id: thread.id, type: 'resume', title: 'Resume', status: 'final' },
        { customer_id: thread.customer_id, thread_id: thread.id, type: 'contract', title: 'Service Contract', status: 'final' },
      ]);
      await supabase.from('conversation_threads').update({ status: 'docs_generated' }).eq('id', thread.id);
      toast.success('Resume & Contract generated!');
      load();
    } catch (err: any) {
      toast.error(err.message || 'Generation failed');
    } finally {
      setProcessing(null);
    }
  };

  const sendForSignature = async (thread: any) => {
    setProcessing(thread.id);
    try {
      const portalLink = `${window.location.origin}/portal/sign/${thread.id}`;
      await supabase.functions.invoke('clawdbot/generate-email', {
        body: { customer_name: thread.customers?.full_name, customer_email: thread.customers?.email, context: 'contract_ready', portal_link: portalLink },
      });
      await supabase.from('conversation_threads').update({ status: 'sent_for_signature' }).eq('id', thread.id);
      toast.success('Sent for signature (email mock). Portal link copied.');
      navigator.clipboard.writeText(portalLink).catch(() => {});
      load();
    } catch (err: any) {
      toast.error(err.message || 'Send failed');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <AppLayout>
      <CategoryGate title="Conversation Threads" {...categoryGate}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">{threads.length} threads</p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Thread</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Thread</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Customer *</Label>
                    <Select value={form.customer_id} onValueChange={v => setForm({ ...form, customer_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                      <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={form.channel} onValueChange={v => setForm({ ...form, channel: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['chat', 'email', 'sms', 'call', 'dm'].map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Transcript</Label>
                    <Textarea value={form.raw_transcript} onChange={e => setForm({ ...form, raw_transcript: e.target.value })} placeholder="Paste conversation transcript..." rows={6} />
                  </div>
                  <Button type="submit" className="w-full" disabled={!form.customer_id}>Create Thread</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-3">
            {threads.map(t => (
              <div key={t.id} className="glass-card p-5">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{t.customers?.full_name || 'Unknown'}</p>
                      <span className="text-xs text-muted-foreground capitalize">via {t.channel}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    {t.summary && <p className="text-xs text-muted-foreground mt-1">{t.summary}</p>}
                    {t.raw_transcript && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.raw_transcript.substring(0, 200)}...</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {t.status === 'open' && (
                      <Button size="sm" variant="outline" onClick={() => analyzeThread(t)} disabled={processing === t.id}>
                        <RotateCw className={`h-3 w-3 mr-1 ${processing === t.id ? 'animate-spin' : ''}`} />Analyze
                      </Button>
                    )}
                    {t.status === 'collecting_info' && (
                      <Button size="sm" variant="outline" onClick={() => analyzeThread(t)} disabled={processing === t.id}>
                        <RotateCw className={`h-3 w-3 mr-1 ${processing === t.id ? 'animate-spin' : ''}`} />Re-analyze
                      </Button>
                    )}
                    {t.status === 'ready_for_docs' && (
                      <Button size="sm" onClick={() => generateDocs(t)} disabled={processing === t.id}>
                        <FileText className={`h-3 w-3 mr-1 ${processing === t.id ? 'animate-spin' : ''}`} />Generate Docs
                      </Button>
                    )}
                    {t.status === 'docs_generated' && (
                      <Button size="sm" onClick={() => sendForSignature(t)} disabled={processing === t.id}>
                        <Send className={`h-3 w-3 mr-1 ${processing === t.id ? 'animate-spin' : ''}`} />Send for Signature
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {threads.length === 0 && !loading && (
              <div className="text-center py-16 text-muted-foreground">No conversation threads yet.</div>
            )}
          </div>
        </div>
      </CategoryGate>
    </AppLayout>
  );
}
