import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { Radar, Plus, Pencil, Trash2, Play, Clock, ScrollText } from 'lucide-react';
import { toast } from 'sonner';

const emptySource = {
  name: '', platform: 'facebook', apify_actor_id: '',
  search_keywords: '', search_cities: '', schedule_cron: '0 6 * * *',
  is_enabled: true, meta: '{}',
};

export default function BuyerSources() {
  const [sources, setSources] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptySource);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [srcRes, logRes] = await Promise.all([
      supabase.from('lw_buyer_discovery_sources').select('*').order('created_at', { ascending: false }),
      supabase.from('lw_buyer_ingestion_logs').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    setSources(srcRes.data || []);
    setLogs(logRes.data || []);
    setLoading(false);
  };

  const openAdd = () => { setEditId(null); setForm(emptySource); setOpen(true); };
  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({
      name: s.name, platform: s.platform, apify_actor_id: s.apify_actor_id || '',
      search_keywords: (s.search_keywords || []).join(', '),
      search_urls: (s.search_urls || []).join('\n'),
      schedule_cron: s.schedule_cron || '0 6 * * *',
      is_enabled: s.is_enabled, meta: JSON.stringify(s.meta || {}, null, 2),
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.apify_actor_id.trim()) {
      toast.error('Name and Actor ID are required');
      return;
    }
    let metaParsed: any = {};
    try { metaParsed = JSON.parse(form.meta || '{}'); } catch { toast.error('Invalid JSON in meta'); return; }

    const payload = {
      name: form.name.trim(),
      platform: form.platform,
      apify_actor_id: form.apify_actor_id.trim(),
      search_keywords: form.search_keywords.split(',').map(s => s.trim()).filter(Boolean),
      search_urls: form.search_urls.split('\n').map(s => s.trim()).filter(Boolean),
      schedule_cron: form.schedule_cron,
      is_enabled: form.is_enabled,
      meta: metaParsed,
    };

    if (editId) {
      const { error } = await supabase.from('lw_buyer_discovery_sources').update(payload).eq('id', editId);
      if (error) { toast.error(error.message); return; }
      toast.success('Source updated');
    } else {
      const { error } = await supabase.from('lw_buyer_discovery_sources').insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success('Source added');
    }
    setOpen(false);
    loadAll();
  };

  const deleteSource = async (id: string) => {
    if (!confirm('Delete this source?')) return;
    await supabase.from('lw_buyer_discovery_sources').delete().eq('id', id);
    toast.success('Source deleted');
    loadAll();
  };

  const runSingle = async (sourceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('buyer-discovery', { body: { source_id: sourceId } });
      if (error) throw error;
      // Check for function-level errors in response body
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      if (data?.results) {
        const failed = data.results.filter((r: any) => r.status === 'error' || r.status === 'skipped');
        const started = data.results.filter((r: any) => r.status === 'started');
        if (started.length > 0) {
          toast.success(`Discovery run started for ${started.length} source(s)`);
        }
        failed.forEach((r: any) => {
          toast.error(`${r.source}: ${r.error || r.reason || 'Failed'}`);
        });
        if (started.length === 0 && failed.length === 0) {
          toast.warning(data.message || 'No sources processed');
        }
      } else {
        toast.success('Discovery run started');
      }
      loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to start discovery');
    }
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await supabase.from('lw_buyer_discovery_sources').update({ is_enabled: enabled }).eq('id', id);
    loadAll();
  };

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      {/* Sources */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Radar className="h-4 w-4" />
            Discovery Sources
            <Badge variant="outline" className="ml-auto">{sources.length} sources</Badge>
            <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" /> Add Source</Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Radar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No discovery sources configured</p>
              <p className="text-xs mt-1">Add Apify actors to start finding buyers automatically</p>
              <Button size="sm" className="mt-3" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" /> Add Source</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Runs</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{s.platform}</Badge></TableCell>
                    <TableCell className="text-xs font-mono max-w-[150px] truncate">{s.apify_actor_id}</TableCell>
                    <TableCell className="text-xs font-mono">{s.schedule_cron}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.last_run_at ? new Date(s.last_run_at).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{s.run_count || 0}</TableCell>
                    <TableCell>
                      <Switch checked={s.is_enabled} onCheckedChange={v => toggleEnabled(s.id, v)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => runSingle(s.id)} title="Run Now">
                          <Play className="h-3.5 w-3.5 text-green-500" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteSource(s.id)}>
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

      {/* Ingestion Logs */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowLogs(!showLogs)}>
          <CardTitle className="text-lg flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            Ingestion Logs
            <Badge variant="outline" className="ml-auto">{logs.length} entries</Badge>
          </CardTitle>
        </CardHeader>
        {showLogs && (
          <CardContent>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No ingestion logs yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>New</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>High Score</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs">{new Date(l.created_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{l.platform}</Badge></TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${
                          l.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                          l.status === 'running' ? 'bg-blue-500/10 text-blue-500' :
                          l.status === 'error' ? 'bg-destructive/10 text-destructive' :
                          'bg-muted text-muted-foreground'
                        }`}>{l.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{l.records_received}</TableCell>
                      <TableCell className="font-mono text-sm text-green-500">{l.records_new}</TableCell>
                      <TableCell className="font-mono text-sm">{l.records_updated}</TableCell>
                      <TableCell className="font-mono text-sm text-orange-500">{l.high_score_count}</TableCell>
                      <TableCell className="text-xs text-destructive max-w-[150px] truncate">{l.error || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}
      </Card>

      {/* Add/Edit Source Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Source' : 'Add Discovery Source'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label>Source Name *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="FB Land Investors Group" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Platform</Label>
                <Select value={form.platform} onValueChange={v => set('platform', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="twitter">Twitter / X</SelectItem>
                    <SelectItem value="craigslist">Craigslist</SelectItem>
                    <SelectItem value="biggerpockets">BiggerPockets</SelectItem>
                    <SelectItem value="directory">Directory</SelectItem>
                    <SelectItem value="web">Web Scraper</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Schedule (cron)</Label>
                <Input value={form.schedule_cron} onChange={e => set('schedule_cron', e.target.value)} placeholder="0 6 * * *" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Apify Actor ID *</Label>
              <Input value={form.apify_actor_id} onChange={e => set('apify_actor_id', e.target.value)} placeholder="apify/facebook-groups-scraper" />
            </div>
            <div className="space-y-1">
              <Label>Search Keywords <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
              <Input value={form.search_keywords} onChange={e => set('search_keywords', e.target.value)} placeholder="cash buyer, land investor, vacant land" />
            </div>
            <div className="space-y-1">
              <Label>Search URLs <span className="text-muted-foreground text-xs">(one per line)</span></Label>
              <Textarea value={form.search_urls} onChange={e => set('search_urls', e.target.value)} rows={3} placeholder="https://facebook.com/groups/landinvestors" />
            </div>
            <div className="space-y-1">
              <Label>Extra Config (JSON)</Label>
              <Textarea value={form.meta} onChange={e => set('meta', e.target.value)} rows={3} className="font-mono text-xs" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_enabled} onCheckedChange={v => set('is_enabled', v)} />
              <Label>Enabled</Label>
            </div>
            <Button className="w-full" onClick={handleSave}>{editId ? 'Update Source' : 'Add Source'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
