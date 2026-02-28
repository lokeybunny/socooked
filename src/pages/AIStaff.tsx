import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Bot, Cpu, Palette, Share2, Radar, ArrowRight, Activity, CheckCircle2, Clock, AlertCircle, ExternalLink, Search, Wrench, Inbox, Brain, Send, Loader2, OctagonX } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Agent definitions ───────────────────────────────────── */
const AGENTS = [
  { id: 'clawd-main', label: 'Dezzi - AI', role: 'Telegram API — Orchestrator', icon: Cpu, color: 'from-violet-500 to-purple-600', ring: 'ring-violet-500/30', bg: 'bg-violet-500/10', text: 'text-violet-400', pulse: 'bg-violet-500', connected: true, group: 'clawd' },
  { id: 'web-designer', label: 'Web Designer', role: 'UI/UX Agent — V0.DEV API', icon: Palette, color: 'from-cyan-500 to-blue-600', ring: 'ring-cyan-500/30', bg: 'bg-cyan-500/10', text: 'text-cyan-400', pulse: 'bg-cyan-500', connected: true, group: 'clawd' },
  { id: 'social-media', label: 'Social Media', role: 'Upload-Post API — Publisher', icon: Share2, color: 'from-pink-500 to-rose-600', ring: 'ring-pink-500/30', bg: 'bg-pink-500/10', text: 'text-pink-400', pulse: 'bg-pink-500', connected: true, group: 'clawd' },
  { id: 'content-manager', label: 'Higgsfield AI', role: 'Content Agent — Video/Image', icon: Bot, color: 'from-amber-500 to-orange-600', ring: 'ring-amber-500/30', bg: 'bg-amber-500/10', text: 'text-amber-400', pulse: 'bg-amber-500', connected: true, group: 'clawd' },
  { id: 'nano-banana', label: 'Nano Banana', role: 'Image AI — Gemini Flash', icon: Palette, color: 'from-yellow-400 to-amber-500', ring: 'ring-yellow-400/30', bg: 'bg-yellow-400/10', text: 'text-yellow-400', pulse: 'bg-yellow-400', connected: true, group: 'clawd' },
  { id: 'gmail-bot', label: 'Telegram', role: 'Bot Command Center — All Activity', icon: Send, color: 'from-[#2AABEE] to-[#229ED9]', ring: 'ring-[#2AABEE]/30', bg: 'bg-[#2AABEE]/10', text: 'text-[#2AABEE]', pulse: 'bg-[#2AABEE]', connected: true, group: 'clawd' },
  { id: 'crm-maintenance', label: 'Zyla - Cortex', role: 'Operations Agent — Cortex AI', icon: Brain, color: 'from-indigo-500 to-blue-600', ring: 'ring-indigo-500/30', bg: 'bg-indigo-500/10', text: 'text-indigo-400', pulse: 'bg-indigo-500', connected: true, group: 'standalone' },
  { id: 'research-finder', label: 'Research Finder', role: 'Research Agent — Coming Soon', icon: Search, color: 'from-teal-500 to-emerald-600', ring: 'ring-teal-500/30', bg: 'bg-teal-500/10', text: 'text-teal-400', pulse: 'bg-teal-500', connected: false, group: 'standalone' },
] as const;

type AgentId = typeof AGENTS[number]['id'];

interface BotTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  bot_agent: string;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
  description: string | null;
  meta: any;
}

interface ApiPreview {
  id: string;
  title: string;
  status: string;
  source: string;
  customer_id: string | null;
  preview_url: string | null;
  edit_url: string | null;
  bot_task_id: string | null;
  created_at: string;
  updated_at: string;
  meta: any;
}

interface ActivityItem {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  meta: any;
  created_at: string;
}

/* ── Flow line SVG connector ─────────────────────────────── */
function FlowLine({ active }: { active: boolean }) {
  return (
    <div className="flex items-center justify-center w-12 md:w-16 shrink-0">
      <svg width="48" height="24" viewBox="0 0 48 24" className="overflow-visible">
        <defs>
          <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <line x1="0" y1="12" x2="48" y2="12" stroke="url(#flowGrad)" strokeWidth="2" strokeDasharray={active ? "0" : "4 4"} />
        <polygon points="42,8 48,12 42,16" fill={active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} opacity={active ? 0.8 : 0.3} />
        {active && (
          <circle r="3" fill="hsl(var(--primary))">
            <animateMotion dur="1.5s" repeatCount="indefinite" path="M0,12 L48,12" />
          </circle>
        )}
      </svg>
    </div>
  );
}

/* ── Pulsing status indicator ────────────────────────────── */
function StatusPulse({ status, pulseColor }: { status: string; pulseColor: string }) {
  const isActive = status === 'in_progress' || status === 'queued';
  return (
    <span className="relative flex h-2.5 w-2.5">
      {isActive && <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", pulseColor)} />}
      <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", 
        status === 'in_progress' ? pulseColor : status === 'completed' ? 'bg-emerald-500' : status === 'failed' ? 'bg-red-500' : 'bg-muted-foreground/40'
      )} />
    </span>
  );
}

/* ── Agent node card ─────────────────────────────────────── */
function AgentNode({ agent, tasks, activities, isSelected, onSelect }: {
  agent: typeof AGENTS[number];
  tasks: BotTask[];
  activities: ActivityItem[];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const activeTasks = tasks.filter(t => t.status === 'in_progress').length;
  const queuedTasks = tasks.filter(t => t.status === 'queued').length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const hasActivity = activeTasks > 0 || queuedTasks > 0;
  const Icon = agent.icon;

  return (
    <motion.button
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-300 min-w-[100px] max-w-[130px] cursor-pointer group",
        isSelected
          ? `border-transparent ring-2 ${agent.ring} bg-card shadow-lg`
          : "border-border/50 bg-card/60 hover:bg-card hover:shadow-md hover:border-border"
      )}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Status indicator */}
      <div className="absolute top-2 right-2">
        <StatusPulse status={hasActivity ? 'in_progress' : 'idle'} pulseColor={agent.pulse} />
      </div>

      {/* Avatar */}
      <div className={cn("p-2 rounded-lg bg-gradient-to-br", agent.color, "shadow-lg")}>
        <Icon className="h-4 w-4 text-white" />
      </div>

      {/* Label */}
      <div className="text-center">
        <p className="text-xs font-semibold text-foreground leading-tight">{agent.label}</p>
        <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{agent.role}</p>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
        {activeTasks > 0 && <span className={cn("flex items-center gap-0.5", agent.text)}><Activity className="h-2.5 w-2.5" />{activeTasks}</span>}
        {queuedTasks > 0 && <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{queuedTasks}</span>}
        {completedTasks > 0 && <span className="flex items-center gap-0.5 text-emerald-500"><CheckCircle2 className="h-2.5 w-2.5" />{completedTasks}</span>}
        {tasks.length === 0 && <span className="italic">Idle</span>}
      </div>
    </motion.button>
  );
}

/* ── Activity feed panel ─────────────────────────────────── */
function ActivityPanel({ agent, tasks, activities, previews, navigate, onPurge, purging }: {
  agent: typeof AGENTS[number];
  tasks: BotTask[];
  activities: ActivityItem[];
  previews: ApiPreview[];
  navigate: (path: string) => void;
  onPurge: () => void;
  purging: boolean;
}) {
  const entityLinks: Record<string, string> = {
    customer: '/customers',
    deal: '/deals',
    task: '/tasks',
    project: '/projects',
    thread: '/threads',
    document: '/documents',
    invoice: '/invoices',
    lead: '/leads',
    card: '/boards',
    meeting: '/meetings',
    content_asset: '/content',
    bot_task: '/tasks',
    communication: '/email',
  };

  const statusIcon = (s: string) => {
    if (s === 'in_progress') return <Activity className="h-3.5 w-3.5 text-amber-500" />;
    if (s === 'completed') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    if (s === 'failed') return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
    return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="mt-6 rounded-xl border border-border bg-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg bg-gradient-to-br", agent.color)}>
            <agent.icon className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{agent.label}</h3>
            <p className="text-xs text-muted-foreground">{agent.role} — Live Activity</p>
          </div>
        </div>
        <button
          onClick={onPurge}
          disabled={purging}
          className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        >
          {purging ? <Loader2 className="h-3 w-3 animate-spin" /> : <OctagonX className="h-3 w-3" />}
          Purge All
        </button>
      </div>

      {/* Active tasks */}
      {tasks.length > 0 ? (
        <div className="space-y-2 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tasks ({tasks.length})</p>
          {tasks.slice(0, 8).map(task => (
            <div key={task.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                {statusIcon(task.status)}
                <span className="text-xs text-foreground truncate">{task.title}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(() => {
                  const previewUrl = (task.meta as any)?.preview_url || previews.find(p => p.bot_task_id === task.id)?.preview_url;
                  return previewUrl ? (
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-primary hover:text-primary/80 transition-colors" title="View preview">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null;
                })()}
                <span className="text-[10px] text-muted-foreground/70">
                  {new Date(task.updated_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric' })} PST
                </span>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0",
                  task.status === 'in_progress' ? 'bg-amber-500/10 text-amber-500' :
                  task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                  task.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                  'bg-muted text-muted-foreground'
                )}>{task.status.replace('_', ' ')}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic mb-4">No active tasks — agent is idle</p>
      )}

      {/* Recent activity */}
      {activities.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Recent Activity</p>
          {activities.slice(0, 6).map(a => {
            const link = entityLinks[a.entity_type];
            const name = (a.meta as any)?.name || a.entity_type;
            return (
                <div key={a.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    <span className="capitalize">{a.action}</span> <span className="text-foreground font-medium">{name}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-muted-foreground/70">
                    {new Date(a.created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric' })} PST
                  </span>
                  {link && (
                    <button onClick={() => navigate(link)} className="text-muted-foreground hover:text-foreground transition-colors">
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

/* ── Main page ───────────────────────────────────────────── */
export default function AIStaff() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<BotTask[]>([]);
  const [previews, setPreviews] = useState<ApiPreview[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [smmPlans, setSmmPlans] = useState<any[]>([]);
  const [smmConversations, setSmmConversations] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentId>('clawd-main');
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);

  const load = useCallback(async () => {
    const [bt, al, pv, sp, sc] = await Promise.all([
      supabase.from('bot_tasks').select('*').order('updated_at', { ascending: false }).limit(100),
      supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('api_previews').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('smm_content_plans').select('id,profile_username,platform,plan_name,status,updated_at,schedule_items').order('updated_at', { ascending: false }).limit(20),
      supabase.from('smm_conversations').select('id,role,message,source,platform,profile_username,created_at').order('created_at', { ascending: false }).limit(30),
    ]);
    setTasks((bt.data || []) as BotTask[]);
    setActivities((al.data || []) as ActivityItem[]);
    setPreviews((pv.data || []) as ApiPreview[]);
    setSmmPlans(sp.data || []);
    setSmmConversations(sc.data || []);
    setLoading(false);
  }, []);

  const handlePurgeAll = useCallback(async () => {
    setPurging(true);
    try {
      // 1. Purge all queued/in_progress bot_tasks
      const { error } = await supabase
        .from('bot_tasks')
        .update({ status: 'failed' })
        .in('status', ['queued', 'in_progress']);
      if (error) throw error;

      // 2. Purge all non-terminal api_previews
      await supabase
        .from('api_previews')
        .update({ status: 'failed' })
        .not('status', 'in', '("completed","failed")');

      // 3. Purge in-progress SMM schedule items (set generating → failed)
      const { data: activePlans } = await supabase
        .from('smm_content_plans')
        .select('id,schedule_items')
        .in('status', ['draft', 'live']);
      if (activePlans) {
        for (const plan of activePlans) {
          const items = (plan.schedule_items || []) as any[];
          const hasGenerating = items.some((i: any) => i.status === 'generating');
          if (hasGenerating) {
            const patched = items.map((i: any) => i.status === 'generating' ? { ...i, status: 'failed', hf_request_id: undefined } : i);
            await supabase.from('smm_content_plans').update({ schedule_items: patched }).eq('id', plan.id);
          }
        }
      }

      toast.success('All queued & in-progress jobs purged across all bots');
      await load();
    } catch (e: any) {
      toast.error(`Purge failed: ${e.message}`);
    }
    setPurging(false);
  }, [load]);

  useEffect(() => { load(); }, [load]);

  // Poll v0-poll for any generating previews every 15s
  useEffect(() => {
    const hasPending = previews.some(p => p.status === 'pending' || p.status === 'generating');
    if (!hasPending) return;

    const interval = setInterval(async () => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/v0-poll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal': 'true' },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.data?.updated > 0) load();
        }
      } catch (e) {
        console.warn('[v0-poll] client poll error:', e);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [previews, load]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('ai-staff-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_tasks' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'api_previews' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'smm_content_plans' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'smm_conversations' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const agentMeta = (id: string) => AGENTS.find(a => a.id === id);
  
  // Synthesize tasks from api_previews for web-designer, merge with bot_tasks
  const agentTasks = (id: string): BotTask[] => {
    if (!agentMeta(id)?.connected) return [];
    
    if (id === 'nano-banana') {
      const nanaTasks = tasks.filter(t => t.bot_agent === 'content-manager' && (t.meta as any)?.provider === 'nano-banana');
      return nanaTasks.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5);
    }
    
    if (id === 'content-manager') {
      const hfTasks = tasks.filter(t => t.bot_agent === 'content-manager' && (t.meta as any)?.provider !== 'nano-banana');
      return hfTasks.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5);
    }

    if (id === 'gmail-bot') {
      return tasks.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 10);
    }

    if (id === 'social-media') {
      // Synthesize tasks from SMM data sources
      const smmBotTasks = tasks.filter(t => 
        t.bot_agent === 'social-media' ||
        t.bot_agent === 'smm' ||
        (t.meta as any)?.provider === 'smm' ||
        (t.meta as any)?.provider === 'upload-post' ||
        (t.meta as any)?.name?.includes('📱') ||
        (t.meta as any)?.name?.toLowerCase()?.includes('smm') ||
        (t.meta as any)?.name?.toLowerCase()?.includes('social') ||
        (t.meta as any)?.name?.toLowerCase()?.includes('instagram') ||
        (t.meta as any)?.name?.toLowerCase()?.includes('media gen') ||
        t.title?.toLowerCase()?.includes('social') ||
        t.title?.toLowerCase()?.includes('smm') ||
        t.title?.toLowerCase()?.includes('instagram') ||
        t.title?.toLowerCase()?.includes('content plan') ||
        t.title?.toLowerCase()?.includes('post')
      );

      // Synthesize tasks from content plans
      const planTasks: BotTask[] = smmPlans.map(p => {
        const items = (p.schedule_items || []) as any[];
        const readyCount = items.filter((i: any) => i.status === 'ready').length;
        const genCount = items.filter((i: any) => i.status === 'generating').length;
        const totalCount = items.length;
        const planStatus = genCount > 0 ? 'in_progress' : p.status === 'live' ? 'completed' : 'queued';
        return {
          id: `plan-${p.id}`,
          title: `📋 ${p.plan_name} — ${readyCount}/${totalCount} ready${genCount > 0 ? ` (${genCount} generating)` : ''}`,
          status: planStatus,
          priority: 'medium',
          bot_agent: 'social-media',
          customer_id: null,
          created_at: p.updated_at,
          updated_at: p.updated_at,
          description: null,
          meta: { platform: p.platform, profile: p.profile_username },
        };
      });

      // Synthesize from recent system conversations (generation status)
      const recentGenMsgs = smmConversations
        .filter(c => c.source === 'system' && c.role === 'cortex')
        .slice(0, 5)
        .map(c => ({
          id: `smm-msg-${c.id}`,
          title: c.message?.substring(0, 100) || 'SMM activity',
          status: c.message?.includes('✅') ? 'completed' : c.message?.includes('❌') ? 'failed' : c.message?.includes('⚡') || c.message?.includes('🎨') ? 'in_progress' : 'queued',
          priority: 'low' as string,
          bot_agent: 'social-media',
          customer_id: null,
          created_at: c.created_at,
          updated_at: c.created_at,
          description: null,
          meta: { platform: c.platform, profile: c.profile_username, source: 'conversation' },
        }));

      const existingIds = new Set(smmBotTasks.map(t => t.id));
      const merged = [
        ...smmBotTasks,
        ...planTasks.filter(t => !existingIds.has(t.id)),
        ...recentGenMsgs.filter(t => !existingIds.has(t.id)),
      ];
      return merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 15);
    }

    const botTasks = tasks.filter(t => t.bot_agent === id);
    
    if (id === 'web-designer') {
      const previewTasks: BotTask[] = previews.map(p => ({
        id: p.id,
        title: p.title,
        status: p.status === 'completed' ? 'completed' : p.status === 'failed' ? 'failed' : 'in_progress',
        priority: 'medium',
        bot_agent: 'web-designer',
        customer_id: p.customer_id,
        created_at: p.created_at,
        updated_at: p.updated_at,
        description: null,
        meta: { ...(p.meta as object), preview_url: p.preview_url, edit_url: p.edit_url },
      }));
      const ids = new Set(botTasks.map(t => t.id));
      const merged = [...botTasks, ...previewTasks.filter(t => !ids.has(t.id))];
      return merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5);
    }
    
    if (id === 'clawd-main') {
      return botTasks.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5);
    }
    
    return botTasks.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5);
  };

  const agentActivities = (id: string) => {
    if (!agentMeta(id)?.connected) return [];
    if (id === 'web-designer') {
      return activities.filter(a => 
        a.action.startsWith('v0_design') || 
        a.action.startsWith('V0_design') ||
        (a.entity_type === 'conversation_thread' && (a.meta as any)?.name?.toLowerCase().includes('v0')) ||
        (a.entity_type === 'bot_task' && (a.meta as any)?.name?.toLowerCase().includes('web design'))
      );
    }
    if (id === 'content-manager') {
      return activities.filter(a => 
        a.action.startsWith('higgsfield_') ||
        (a.entity_type === 'content_asset' && a.action.includes('higgsfield'))
      );
    }
    if (id === 'nano-banana') {
      return activities.filter(a => 
        a.action.startsWith('nano_banana') ||
        (a.entity_type === 'content_asset' && a.action.includes('nano_banana')) ||
        (a.meta as any)?.provider === 'nano-banana'
      );
    }
    if (id === 'social-media') {
      return activities.filter(a => {
        const name = ((a.meta as any)?.name || '').toLowerCase();
        const action = a.action.toLowerCase();
        return (
          action.startsWith('smm_') ||
          action.includes('media_gen') ||
          action.includes('content_plan') ||
          action.includes('post_published') ||
          action.includes('post_scheduled') ||
          a.entity_type === 'smm' ||
          a.entity_type === 'smm_content_plans' ||
          a.entity_type === 'smm_conversations' ||
          name.includes('📱') ||
          name.includes('smm') ||
          name.includes('social') ||
          name.includes('instagram') ||
          name.includes('media gen') ||
          name.includes('carousel') ||
          name.includes('content plan') ||
          name.includes('upload-post') ||
          name.includes('schedule')
        );
      }).slice(0, 15);
    }
    if (id === 'gmail-bot') {
      // Show ALL activity — this is the Telegram bot command center
      return activities.slice(0, 20);
    }
    if (id === 'crm-maintenance') {
      return activities.filter(a => 
        a.action.startsWith('cortex_') ||
        a.action.startsWith('zyla_') ||
        (a.meta as any)?.name?.toLowerCase().includes('cortex')
      );
    }
    return activities;
  };

  const selected = AGENTS.find(a => a.id === selectedAgent)!;
  const mainAgent = AGENTS[0];
  const clawdChildren = AGENTS.filter(a => a.group === 'clawd' && a.id !== 'clawd-main');
  const standaloneAgents = AGENTS.filter(a => a.group === 'standalone');

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" /> AI Staff
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor your AI agents in real-time</p>
        </div>

        {/* ── Flow diagram ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* BOT 1 — CLAWD Network */}
          <div className="rounded-xl border border-border bg-card/40 p-5 relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-2.5 w-2.5 rounded-full bg-violet-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Bot 1 — Telegram API Bots</span>
            </div>
            <div className="flex items-center justify-center min-w-0">
              {/* Left children */}
              <div className="flex flex-col gap-3">
                {clawdChildren.slice(0, 2).map(agent => (
                  <AgentNode
                    key={agent.id}
                    agent={agent}
                    tasks={agentTasks(agent.id)}
                    activities={agentActivities(agent.id)}
                    isSelected={selectedAgent === agent.id}
                    onSelect={() => setSelectedAgent(agent.id)}
                  />
                ))}
              </div>

              {/* Left connectors */}
              <div className="flex flex-col items-center mx-2 shrink-0">
                <svg width="60" height="120" viewBox="0 0 60 120" className="overflow-visible">
                  {clawdChildren.slice(0, 2).map((_agent, i) => {
                    const y = 30 + i * 60;
                    return (
                      <g key={i}>
                        <line x1="0" y1={y} x2="60" y2="60" stroke="hsl(var(--primary))" strokeWidth="2" strokeDasharray="6 4" opacity="0.5" />
                        <circle cx="30" cy={(y + 60) / 2} r="3" fill="hsl(var(--primary))" opacity="0.6" />
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Main node */}
              <AgentNode
                agent={mainAgent}
                tasks={agentTasks(mainAgent.id)}
                activities={agentActivities(mainAgent.id)}
                isSelected={selectedAgent === mainAgent.id}
                onSelect={() => setSelectedAgent(mainAgent.id)}
              />

              {/* Right connectors */}
              {clawdChildren.length > 2 && (() => {
                const rightChildren = clawdChildren.slice(2);
                const gap = 12; // gap-3 = 12px
                const cardH = 120; // approx card height
                const totalH = rightChildren.length * cardH + (rightChildren.length - 1) * gap;
                const midY = totalH / 2;
                return (
                  <div className="flex flex-col items-center mx-2 shrink-0">
                    <svg width="60" height={totalH} viewBox={`0 0 60 ${totalH}`} className="overflow-visible">
                      {rightChildren.map((_agent, i) => {
                        const cardCenter = i * (cardH + gap) + cardH / 2;
                        return (
                          <g key={i}>
                            <line x1="0" y1={midY} x2="60" y2={cardCenter} stroke="hsl(var(--primary))" strokeWidth="2" strokeDasharray="6 4" opacity="0.5" />
                            <circle cx="30" cy={(midY + cardCenter) / 2} r="3" fill="hsl(var(--primary))" opacity="0.6" />
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                );
              })()}

              {/* Right child */}
              {clawdChildren.length > 2 && (
                <div className="flex flex-col gap-3">
                  {clawdChildren.slice(2).map(agent => (
                    <AgentNode
                      key={agent.id}
                      agent={agent}
                      tasks={agentTasks(agent.id)}
                      activities={agentActivities(agent.id)}
                      isSelected={selectedAgent === agent.id}
                      onSelect={() => setSelectedAgent(agent.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* BOT 2 — Intuitive AI Thinker */}
          <div className="rounded-xl border border-border bg-card/40 p-5 relative flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Bot 2 — Intuitive AI Thinker</span>
            </div>
            <div className="flex items-center justify-center flex-1 gap-2">
              {(() => {
                const zyla = standaloneAgents.find(a => a.id === 'crm-maintenance')!;
                const research = standaloneAgents.find(a => a.id === 'research-finder')!;
                return (
                  <>
                    <AgentNode
                      agent={zyla}
                      tasks={agentTasks(zyla.id)}
                      activities={agentActivities(zyla.id)}
                      isSelected={selectedAgent === zyla.id}
                      onSelect={() => setSelectedAgent(zyla.id)}
                    />
                    <FlowLine active={false} />
                    <AgentNode
                      agent={research}
                      tasks={agentTasks(research.id)}
                      activities={agentActivities(research.id)}
                      isSelected={selectedAgent === research.id}
                      onSelect={() => setSelectedAgent(research.id)}
                    />
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {/* ── Detail panel ────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <ActivityPanel
            key={selected.id}
            agent={selected}
            tasks={agentTasks(selected.id)}
            activities={agentActivities(selected.id)}
            previews={previews}
            navigate={navigate}
            onPurge={handlePurgeAll}
            purging={purging}
          />
        </AnimatePresence>

        {/* ── Summary stats ───────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {AGENTS.map(a => {
            const t = agentTasks(a.id);
            return (
              <button key={a.id} onClick={() => setSelectedAgent(a.id)}
                className={cn("p-4 rounded-xl border transition-all text-left", selectedAgent === a.id ? `ring-1 ${a.ring} bg-card` : "border-border/50 bg-card/40 hover:bg-card")}>
                <div className="flex items-center gap-2 mb-2">
                  <StatusPulse status={t.some(t => t.status === 'in_progress') ? 'in_progress' : 'idle'} pulseColor={a.pulse} />
                  <span className="text-xs font-medium text-foreground">{a.label}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{t.filter(t => t.status === 'queued').length} queued</span>
                  <span>{t.filter(t => t.status === 'in_progress').length} active</span>
                  <span>{t.filter(t => t.status === 'completed').length} done</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
