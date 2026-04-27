import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Phone, Play, Pause, Square, SkipForward, Plus, Users, PhoneCall,
  Voicemail, PhoneOff, Clock, CheckCircle, AlertCircle, Loader2,
  Settings, List, BarChart3, Search, RefreshCw, Trash2, Sparkles, Zap, CalendarClock,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PowerDialQueue from '@/components/powerdial/PowerDialQueue';
import PowerDialCallLog from '@/components/powerdial/PowerDialCallLog';
import PowerDialSettings from '@/components/powerdial/PowerDialSettings';
import PowerDialHealthMonitor from '@/components/powerdial/PowerDialHealthMonitor';
import PowerDialStallDiagnostics from '@/components/powerdial/PowerDialStallDiagnostics';

type Campaign = {
  id: string;
  name: string;
  status: string;
  total_leads: number;
  completed_count: number;
  human_count: number;
  voicemail_count: number;
  busy_count: number;
  no_answer_count: number;
  failed_count: number;
  current_index: number;
  settings: any;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  schedule_status: string | null;
};

export default function PowerDial() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [useLeads, setUseLeads] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [foundLeads, setFoundLeads] = useState<any[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [currentDialing, setCurrentDialing] = useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduleEndDate, setScheduleEndDate] = useState('');
  const [scheduleEndTime, setScheduleEndTime] = useState('17:00');

  const loadCampaigns = useCallback(async () => {
    const { data } = await supabase
      .from('powerdial_campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    setCampaigns((data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  // Realtime subscription for campaign updates
  useEffect(() => {
    if (!activeCampaign) return;
    const channel = supabase
      .channel(`powerdial-campaign-${activeCampaign.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'powerdial_campaigns',
        filter: `id=eq.${activeCampaign.id}`,
      }, (payload: any) => {
        if (payload.new) {
          setActiveCampaign(payload.new as Campaign);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeCampaign?.id]);

  // Realtime for queue to track current dialing
  useEffect(() => {
    if (!activeCampaign) return;
    const channel = supabase
      .channel(`powerdial-queue-${activeCampaign.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'powerdial_queue',
        filter: `campaign_id=eq.${activeCampaign.id}`,
      }, (payload: any) => {
        if (payload.new?.status === 'dialing') {
          setCurrentDialing(payload.new);
        } else if (currentDialing?.id === payload.new?.id) {
          setCurrentDialing(null);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeCampaign?.id]);

  const invokeEngine = async (body: any) => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('powerdial-engine', { body });
      if (error) {
        window.dispatchEvent(new CustomEvent('powerdial:engine', {
          detail: { action: body?.action || 'unknown', result: 'error', detail: error.message },
        }));
        throw error;
      }
      const d: any = data || {};
      const resultLabel = d?.dialed ? 'dialed' : (d?.reason || d?.status || 'ok');
      window.dispatchEvent(new CustomEvent('powerdial:engine', {
        detail: { action: body?.action || 'unknown', result: resultLabel, detail: d?.message },
      }));
      if (d?.reason && (d.reason === 'twilio_error' || d.reason === 'twilio_from_missing') && d?.message) {
        toast.error(d.message);
      }
      await loadCampaigns();
      if (activeCampaign) {
        const { data: updated } = await supabase.from('powerdial_campaigns').select('*').eq('id', activeCampaign.id).single();
        if (updated) setActiveCampaign(updated as Campaign);
      }
      return data;
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Extract phone numbers from messy pasted text (addresses, names, URLs, etc.)
  const extractPhones = (raw: string): { phone: string; name: string | null }[] => {
    // Match common US phone formats: (xxx) xxx-xxxx, xxx-xxx-xxxx, xxx.xxx.xxxx, +1xxxxxxxxxx, etc.
    const phoneRegex = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
    const seen = new Set<string>();
    const results: { phone: string; name: string | null }[] = [];
    const lines = raw.split('\n');

    for (const line of lines) {
      const matches = line.match(phoneRegex);
      if (!matches) continue;
      for (const match of matches) {
        const digits = match.replace(/\D/g, '');
        // Normalize: must be 10 or 11 digits (with leading 1)
        const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
        if (normalized.length !== 10) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        // Try to extract a name from the same line (text before the phone number)
        const idx = line.indexOf(match);
        const before = line.slice(0, idx).replace(/[^a-zA-Z\s&'.-]/g, '').trim();
        // Filter out noise: must be 2+ chars, not just whitespace
        const name = before.length >= 2 && !/^\d+$/.test(before) ? before : null;
        results.push({ phone: `+1${normalized}`, name });
      }
    }
    return results;
  };

  const handleCreate = async () => {
    if (!user) return;
    const phones = useLeads ? undefined : extractPhones(phoneInput);
    const lead_ids = useLeads ? selectedLeadIds : undefined;

    if (!phones?.length && !lead_ids?.length) {
      toast.error('Add phone numbers or select leads');
      return;
    }

    const result = await invokeEngine({
      action: 'create_campaign',
      user_id: user.id,
      campaign_name: newName || 'Untitled Campaign',
      phones,
      lead_ids,
    });

    if (result?.campaign_id) {
      // If scheduling is enabled, set the scheduled start time (convert PST to UTC)
      if (scheduleEnabled && scheduleDate && scheduleTime) {
        const localParts = `${scheduleDate}T${scheduleTime}:00`.split(/[-T:]/);
        const pstStart = new Date(Date.UTC(
          parseInt(localParts[0]), parseInt(localParts[1]) - 1, parseInt(localParts[2]),
          parseInt(localParts[3]) + 8, parseInt(localParts[4])
        ));

        const updatePayload: any = {
          scheduled_start: pstStart.toISOString(),
          schedule_status: 'scheduled',
        };

        // End time
        if (scheduleEndDate && scheduleEndTime) {
          const endParts = `${scheduleEndDate}T${scheduleEndTime}:00`.split(/[-T:]/);
          const pstEnd = new Date(Date.UTC(
            parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]),
            parseInt(endParts[3]) + 8, parseInt(endParts[4])
          ));
          updatePayload.scheduled_end = pstEnd.toISOString();
        }

        await supabase.from('powerdial_campaigns').update(updatePayload).eq('id', result.campaign_id);

        toast.success(`Campaign scheduled: ${scheduleDate} ${scheduleTime}${scheduleEndDate ? ` → ${scheduleEndDate} ${scheduleEndTime}` : ''} PST`);
      } else {
        toast.success(`Campaign created with ${result.queued} numbers`);
      }

      setShowCreate(false);
      setNewName('');
      setPhoneInput('');
      setSelectedLeadIds([]);
      setScheduleEnabled(false);
      setScheduleDate('');
      setScheduleTime('09:00');
      setScheduleEndDate('');
      setScheduleEndTime('17:00');
      await loadCampaigns();
      const { data: newCamp } = await supabase.from('powerdial_campaigns').select('*').eq('id', result.campaign_id).single();
      if (newCamp) setActiveCampaign(newCamp as Campaign);
    }
  };

  const searchLeads = async () => {
    if (!leadSearch.trim()) return;
    const { data } = await supabase
      .from('customers')
      .select('id, full_name, phone, status, category')
      .not('phone', 'is', null)
      .or(`full_name.ilike.%${leadSearch}%,phone.ilike.%${leadSearch}%,company.ilike.%${leadSearch}%`)
      .order('updated_at', { ascending: false })
      .limit(50);
    setFoundLeads(data || []);
  };

  const statusColor: Record<string, string> = {
    idle: 'bg-muted text-muted-foreground',
    running: 'bg-emerald-500/20 text-emerald-400',
    paused: 'bg-amber-500/20 text-amber-400',
    stopped: 'bg-red-500/20 text-red-400',
    completed: 'bg-blue-500/20 text-blue-400',
  };

  const handleDeleteCampaign = async (id: string) => {
    await supabase.from('powerdial_queue').delete().eq('campaign_id', id);
    await supabase.from('powerdial_campaigns').delete().eq('id', id);
    if (activeCampaign?.id === id) setActiveCampaign(null);
    setDeleteConfirmId(null);
    toast.success('Campaign deleted');
    loadCampaigns();
  };

  const handleBulkDelete = async () => {
    for (const id of bulkSelected) {
      await supabase.from('powerdial_queue').delete().eq('campaign_id', id);
      await supabase.from('powerdial_campaigns').delete().eq('id', id);
      if (activeCampaign?.id === id) setActiveCampaign(null);
    }
    setBulkDeleteConfirm(false);
    setBulkSelected([]);
    setBulkMode(false);
    toast.success(`${bulkSelected.length} campaign(s) deleted`);
    loadCampaigns();
  };

  const deletableCampaigns = campaigns.filter(c => ['stopped', 'completed', 'idle'].includes(c.status));

  const remaining = activeCampaign ? activeCampaign.total_leads - activeCampaign.completed_count : 0;

  return (
    <AppLayout>
      <div className="space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-400/20">
              <Sparkles className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">PowerD</h1>
              <p className="text-xs text-muted-foreground">Automated outbound calling system</p>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)} size="sm" className="bg-purple-500 hover:bg-purple-600 text-white">
            <Plus className="h-4 w-4 mr-1" /> New Campaign
          </Button>
        </div>

        {/* Campaign Selector */}
        <div className="flex items-center gap-3 flex-wrap">
          {!bulkMode ? (
            <>
              <Select
                value={activeCampaign?.id || ''}
                onValueChange={(id) => {
                  const c = campaigns.find(c => c.id === id);
                  setActiveCampaign(c || null);
                }}
              >
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Select a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {c.schedule_status === 'scheduled' ? `⏰ scheduled` : c.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={loadCampaigns}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              {activeCampaign && (activeCampaign.status === 'stopped' || activeCampaign.status === 'completed' || activeCampaign.status === 'idle') && (
                <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => setDeleteConfirmId(activeCampaign.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {deletableCampaigns.length > 1 && (
                <Button variant="outline" size="sm" onClick={() => { setBulkMode(true); setBulkSelected([]); }}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Bulk Remove
                </Button>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setBulkMode(false); setBulkSelected([]); }}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={bulkSelected.length === 0}
                  onClick={() => setBulkDeleteConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete {bulkSelected.length} Selected
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBulkSelected(
                    bulkSelected.length === deletableCampaigns.length
                      ? []
                      : deletableCampaigns.map(c => c.id)
                  )}
                >
                  {bulkSelected.length === deletableCampaigns.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Bulk selection list */}
        {bulkMode && (
          <ScrollArea className="max-h-[300px] border rounded-md p-2">
            {deletableCampaigns.map(c => (
              <label key={c.id} className="flex items-center gap-3 py-2 px-2 hover:bg-muted/50 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkSelected.includes(c.id)}
                  onChange={() => setBulkSelected(prev =>
                    prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]
                  )}
                  className="rounded"
                />
                <span className="text-sm font-medium">{c.name}</span>
                <Badge className={`ml-auto ${statusColor[c.status] || ''}`}>{c.status}</Badge>
                <span className="text-xs text-muted-foreground">{c.total_leads} leads</span>
              </label>
            ))}
            {deletableCampaigns.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No deletable campaigns (only idle/stopped/completed can be removed)</p>
            )}
          </ScrollArea>
        )}

        {activeCampaign && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              <StatCard label="Total" value={activeCampaign.total_leads} icon={Users} />
              <StatCard label="Completed" value={activeCampaign.completed_count} icon={CheckCircle} />
              <StatCard label="Remaining" value={remaining} icon={Clock} />
              <StatCard label="Humans" value={activeCampaign.human_count} icon={PhoneCall} color="text-emerald-500" />
              <StatCard label="Voicemail" value={activeCampaign.voicemail_count} icon={Voicemail} color="text-amber-500" />
              <StatCard label="Busy" value={activeCampaign.busy_count} icon={PhoneOff} color="text-orange-500" />
              <StatCard label="No Answer" value={activeCampaign.no_answer_count} icon={Clock} color="text-yellow-500" />
              <StatCard label="Failed" value={activeCampaign.failed_count} icon={AlertCircle} color="text-red-500" />
            </div>

            {/* Controls + Live Status */}
            <div className="flex flex-wrap items-center gap-3">
              <Badge className={statusColor[activeCampaign.status] || ''}>
                {activeCampaign.status.toUpperCase()}
              </Badge>

              {/* Scheduled indicator */}
              {activeCampaign.schedule_status === 'scheduled' && activeCampaign.scheduled_start && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10">
                  <CalendarClock className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-xs text-amber-300">
                    Scheduled: {new Date(activeCampaign.scheduled_start).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                    {activeCampaign.scheduled_end && (
                      <> → {new Date(activeCampaign.scheduled_end).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</>
                    )} PST
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px] text-amber-400 hover:text-amber-300"
                    onClick={async () => {
                      await supabase.from('powerdial_campaigns').update({ schedule_status: null, scheduled_start: null, scheduled_end: null }).eq('id', activeCampaign.id);
                      toast.info('Schedule cancelled — campaign is now manual');
                      loadCampaigns();
                    }}
                  >
                    Cancel Schedule
                  </Button>
                </div>
              )}
              {activeCampaign.schedule_status === 'triggered' && (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
                  <CalendarClock className="h-3 w-3 mr-1" /> Auto-started
                </Badge>
              )}

              {/* 3x Dial Toggle */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10">
                <Zap className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs font-medium text-purple-300">3x Dial</span>
                <Switch
                  checked={Boolean(activeCampaign.settings?.triple_dial)}
                  onCheckedChange={async (checked) => {
                    const newSettings = { ...(activeCampaign.settings || {}), triple_dial: checked };
                    await supabase.from('powerdial_campaigns').update({ settings: newSettings }).eq('id', activeCampaign.id);
                    setActiveCampaign({ ...activeCampaign, settings: newSettings });
                    toast.success(checked ? '3x Dial enabled — dialing 3 numbers at once' : '3x Dial disabled — single dialing');
                  }}
                  className="data-[state=checked]:bg-purple-500"
                />
              </div>

              {/* AI Enabled Toggle */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-300">AI</span>
                <Switch
                  checked={activeCampaign.settings?.ai_enabled !== false}
                  onCheckedChange={async (checked) => {
                    const DEFAULT_TRANSFER = '+17027016192';
                    const existingTransfer = String(activeCampaign.settings?.human_transfer_phone || '').trim();
                    const transfer = existingTransfer || (!checked ? DEFAULT_TRANSFER : '');
                    const newSettings = {
                      ...(activeCampaign.settings || {}),
                      ai_enabled: checked,
                      human_transfer_phone: transfer || existingTransfer,
                    };
                    await supabase.from('powerdial_campaigns').update({ settings: newSettings }).eq('id', activeCampaign.id);
                    setActiveCampaign({ ...activeCampaign, settings: newSettings });
                    if (!checked && !existingTransfer) {
                      toast.success(`AI disabled — calls will ring ${DEFAULT_TRANSFER} (change in Settings)`);
                    } else {
                      toast.success(checked ? 'AI enabled — Vapi will handle answered calls' : 'AI disabled — answered calls will ring your phone');
                    }
                  }}
                  className="data-[state=checked]:bg-emerald-500"
                />
              </div>

              {(activeCampaign.status === 'idle' || activeCampaign.status === 'stopped') && (
                <Button size="sm" onClick={async () => {
                  await supabase.from('powerdial_campaigns').update({
                    schedule_status: null,
                    scheduled_start: null,
                    scheduled_end: null,
                    ended_at: null,
                  }).eq('id', activeCampaign.id);
                  await invokeEngine({ action: 'start', campaign_id: activeCampaign.id });
                }} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                  Start Campaign
                </Button>
              )}
              {activeCampaign.status === 'completed' && (
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!confirm('Restart this campaign? All queued numbers will be re-dialed from the start.')) return;
                    try {
                      // Reset all queue items back to pending
                      const { error: qErr } = await supabase
                        .from('powerdial_queue')
                        .update({
                          status: 'pending',
                          last_result: null,
                          retry_at: null,
                        })
                        .eq('campaign_id', activeCampaign.id);
                      if (qErr) throw qErr;

                      // Reset campaign counters and status
                      const { error: cErr } = await supabase
                        .from('powerdial_campaigns')
                        .update({
                          status: 'idle',
                          completed_count: 0,
                          human_count: 0,
                          voicemail_count: 0,
                          busy_count: 0,
                          no_answer_count: 0,
                          failed_count: 0,
                          current_index: 0,
                          schedule_status: null,
                          scheduled_start: null,
                          scheduled_end: null,
                          started_at: null,
                          ended_at: null,
                        })
                        .eq('id', activeCampaign.id);
                      if (cErr) throw cErr;

                      toast.success('Campaign reset — starting now…');
                      await invokeEngine({ action: 'start', campaign_id: activeCampaign.id });
                    } catch (err: any) {
                      toast.error(err?.message || 'Restart failed');
                    }
                  }}
                  disabled={actionLoading}
                  className="bg-purple-500 hover:bg-purple-600"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                  Restart Campaign
                </Button>
              )}
              {activeCampaign.status === 'running' && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => invokeEngine({ action: 'pause', campaign_id: activeCampaign.id })} disabled={actionLoading}>
                    <Pause className="h-4 w-4 mr-1" /> Pause
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => invokeEngine({ action: 'stop', campaign_id: activeCampaign.id })} disabled={actionLoading}>
                    <Square className="h-4 w-4 mr-1" /> Stop
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => invokeEngine({ action: 'skip', campaign_id: activeCampaign.id })} disabled={actionLoading}>
                    <SkipForward className="h-4 w-4 mr-1" /> Skip
                  </Button>
                </>
              )}
              {activeCampaign.status === 'paused' && (
                <>
                  <Button size="sm" onClick={() => invokeEngine({ action: 'resume', campaign_id: activeCampaign.id })} disabled={actionLoading}>
                    <Play className="h-4 w-4 mr-1" /> Resume
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => invokeEngine({ action: 'stop', campaign_id: activeCampaign.id })} disabled={actionLoading}>
                    <Square className="h-4 w-4 mr-1" /> Stop
                  </Button>
                </>
              )}

              {currentDialing && activeCampaign.status === 'running' && (
                <div className="ml-auto flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-muted-foreground">Dialing:</span>
                  <span className="font-mono text-foreground">{currentDialing.phone}</span>
                  {currentDialing.contact_name && (
                    <span className="text-muted-foreground">({currentDialing.contact_name})</span>
                  )}
                </div>
              )}
            </div>

            {/* Tabs */}
            <Tabs defaultValue="queue" className="w-full">
              <TabsList>
                <TabsTrigger value="queue"><List className="h-3.5 w-3.5 mr-1" /> Queue</TabsTrigger>
                <TabsTrigger value="log"><BarChart3 className="h-3.5 w-3.5 mr-1" /> Call Log</TabsTrigger>
                <TabsTrigger value="settings"><Settings className="h-3.5 w-3.5 mr-1" /> Settings</TabsTrigger>
              </TabsList>
              <TabsContent value="queue">
                <PowerDialQueue campaignId={activeCampaign.id} />
              </TabsContent>
              <TabsContent value="log">
                <PowerDialCallLog campaignId={activeCampaign.id} />
              </TabsContent>
              <TabsContent value="settings">
                <PowerDialSettings campaign={activeCampaign} onUpdate={() => loadCampaigns()} />
              </TabsContent>
            </Tabs>

            {/* Stall Diagnostics — explains health monitor decisions */}
            <PowerDialStallDiagnostics campaignId={activeCampaign.id} />

            {/* Pipeline Health Monitor */}
            <PowerDialHealthMonitor
              campaignId={activeCampaign.id}
              campaignStatus={activeCampaign.status}
              settings={activeCampaign.settings}
            />
          </>
        )}

        {/* Test Call Button */}
        <TestCallButton />

        {!activeCampaign && !loading && (
          <div className="glass-card p-12 text-center">
            <Phone className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Select or create a campaign to get started</p>
          </div>
        )}
      </div>

      {/* Create Campaign Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New PowerD Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Campaign Name</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Web Design Leads Q2" />
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant={!useLeads ? 'default' : 'outline'} onClick={() => setUseLeads(false)}>
                Paste Numbers
              </Button>
              <Button size="sm" variant={useLeads ? 'default' : 'outline'} onClick={() => setUseLeads(true)}>
                Select CRM Leads
              </Button>
            </div>

            {!useLeads ? (
              <div>
                <Label>Phone Numbers (one per line, optionally: number, name)</Label>
                <Textarea
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  placeholder={"7025551234\n7025555678, John Smith\n+18005551111, Jane Doe"}
                  rows={8}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input value={leadSearch} onChange={e => setLeadSearch(e.target.value)} placeholder="Search leads by name/phone..." onKeyDown={e => e.key === 'Enter' && searchLeads()} />
                  <Button size="sm" onClick={searchLeads}><Search className="h-4 w-4" /></Button>
                </div>
                <ScrollArea className="h-[200px] border rounded-md p-2">
                  {foundLeads.map(l => (
                    <label key={l.id} className="flex items-center gap-2 py-1.5 px-1 hover:bg-muted/50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.includes(l.id)}
                        onChange={() => {
                          setSelectedLeadIds(prev =>
                            prev.includes(l.id) ? prev.filter(x => x !== l.id) : [...prev, l.id]
                          );
                        }}
                      />
                      <span className="text-sm">{l.full_name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{l.phone}</span>
                    </label>
                  ))}
                  {foundLeads.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Search for leads above</p>}
                </ScrollArea>
                {selectedLeadIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedLeadIds.length} leads selected</p>
                )}
              </div>
            )}

            {/* Schedule Section */}
            <div className="border border-border/50 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-purple-400" />
                  <Label className="text-sm font-medium">Schedule Campaign</Label>
                </div>
                <Switch
                  checked={scheduleEnabled}
                  onCheckedChange={setScheduleEnabled}
                  className="data-[state=checked]:bg-purple-500"
                />
              </div>
              {scheduleEnabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Start Date</Label>
                    <Input
                      type="date"
                      value={scheduleDate}
                      onChange={e => setScheduleDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Start Time (PST)</Label>
                    <Input
                      type="time"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">End Date</Label>
                    <Input
                      type="date"
                      value={scheduleEndDate}
                      onChange={e => setScheduleEndDate(e.target.value)}
                      min={scheduleDate || new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">End Time (PST)</Label>
                    <Input
                      type="time"
                      value={scheduleEndTime}
                      onChange={e => setScheduleEndTime(e.target.value)}
                    />
                  </div>
                  <p className="col-span-2 text-[10px] text-muted-foreground">
                    Campaign auto-starts at start time and auto-stops at end time — no after-hours calls. All times PST.
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : scheduleEnabled ? <Clock className="h-4 w-4 mr-1" /> : null}
              {scheduleEnabled ? 'Schedule Campaign' : 'Create Campaign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Campaign Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the campaign, its queue, and all associated data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteConfirmId && handleDeleteCampaign(deleteConfirmId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={(open) => !open && setBulkDeleteConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulkSelected.length} Campaign(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected campaigns, their queues, and all associated data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleBulkDelete}>
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function TestCallButton() {
  const [open, setOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const handleTestCall = async () => {
    if (!testPhone.trim()) {
      toast.error('Enter a phone number to test');
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('powerdial-engine', {
        body: { action: 'test_call', phone: testPhone.trim() },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        setTestResult({ error: data.error });
      } else {
        toast.success(`Test call placed to ${data.to}`);
        setTestResult(data);
      }
    } catch (err: any) {
      toast.error(err.message || 'Test call failed');
      setTestResult({ error: err.message });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
      >
        <PhoneCall className="h-4 w-4 mr-1" /> TEST CALL
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-purple-400/20">
                <PhoneCall className="h-4 w-4 text-purple-400" />
              </div>
              Test Call
            </DialogTitle>
            <DialogDescription>
              Place a single test outbound call before running a full campaign. Uses your configured Vapi assistant and Twilio number.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="e.g. 7025551234"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTestCall()}
                className="font-mono"
              />
              <Button
                onClick={handleTestCall}
                disabled={testLoading}
                size="sm"
                className="bg-purple-500 hover:bg-purple-600 text-white shrink-0"
              >
                {testLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4 mr-1" />}
                {testLoading ? 'Calling…' : 'Call'}
              </Button>
            </div>
            {testResult && (
              <div className={`text-xs rounded-md p-2 ${testResult.error ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                {testResult.error
                  ? `❌ ${testResult.error}`
                  : `✅ Call placed — SID: ${testResult.call_sid?.slice(0, 12)}… | From: ${testResult.from} → To: ${testResult.to}`}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: any; color?: string }) {
  return (
    <div className="glass-card p-3 text-center">
      <Icon className={`h-4 w-4 mx-auto mb-1 ${color || 'text-muted-foreground'}`} />
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
