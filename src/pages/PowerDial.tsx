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
  Settings, List, BarChart3, Search, RefreshCw, Trash2, Sparkles,
} from 'lucide-react';
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
      if (error) throw error;
      if ((data as any)?.reason && ((data as any)?.reason === 'twilio_error' || (data as any)?.reason === 'twilio_from_missing') && (data as any)?.message) {
        toast.error((data as any).message);
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

  const handleCreate = async () => {
    if (!user) return;
    const phones = useLeads ? undefined : phoneInput.split('\n').map(l => l.trim()).filter(Boolean).map(p => {
      const parts = p.split(',');
      return parts.length > 1 ? { phone: parts[0].trim(), name: parts[1].trim() } : p;
    });
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
      toast.success(`Campaign created with ${result.queued} numbers`);
      setShowCreate(false);
      setNewName('');
      setPhoneInput('');
      setSelectedLeadIds([]);
      await loadCampaigns();
      // Auto-select the new campaign
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
    // Delete queue and campaign (call_log may not exist in types, use rpc-safe approach)
    await supabase.from('powerdial_queue').delete().eq('campaign_id', id);
    await supabase.from('powerdial_campaigns').delete().eq('id', id);
    if (activeCampaign?.id === id) setActiveCampaign(null);
    setDeleteConfirmId(null);
    toast.success('Campaign deleted');
    loadCampaigns();
  };

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
        <div className="flex items-center gap-3">
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
                  {c.name} — {c.status}
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
        </div>

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

              {(activeCampaign.status === 'idle' || activeCampaign.status === 'stopped') && (
                <Button size="sm" onClick={() => invokeEngine({ action: 'start', campaign_id: activeCampaign.id })} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                  Start Campaign
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
          </>
        )}

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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Create Campaign
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
    </AppLayout>
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
