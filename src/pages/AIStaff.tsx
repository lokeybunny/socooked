import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Bot, Cpu, Palette, Share2, Radar, ArrowRight, Activity, CheckCircle2, Clock, AlertCircle, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Agent definitions ───────────────────────────────────── */
const AGENTS = [
  { id: 'clawd-main', label: 'CLAWD Main', role: 'SpaceBot.sh — Orchestrator', icon: Cpu, color: 'from-violet-500 to-purple-600', ring: 'ring-violet-500/30', bg: 'bg-violet-500/10', text: 'text-violet-400', pulse: 'bg-violet-500', connected: true },
  { id: 'web-designer', label: 'Web Designer', role: 'UI/UX Agent — Coming Soon', icon: Palette, color: 'from-cyan-500 to-blue-600', ring: 'ring-cyan-500/30', bg: 'bg-cyan-500/10', text: 'text-cyan-400', pulse: 'bg-cyan-500', connected: false },
  { id: 'social-media', label: 'Social Media', role: 'Content Agent — Coming Soon', icon: Share2, color: 'from-pink-500 to-rose-600', ring: 'ring-pink-500/30', bg: 'bg-pink-500/10', text: 'text-pink-400', pulse: 'bg-pink-500', connected: false },
  { id: 'leads-finder', label: 'Leads Finder', role: 'Outreach Agent — Coming Soon', icon: Radar, color: 'from-emerald-500 to-green-600', ring: 'ring-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-400', pulse: 'bg-emerald-500', connected: false },
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
        "relative flex flex-col items-center gap-3 p-5 rounded-xl border transition-all duration-300 min-w-[140px] md:min-w-[160px] cursor-pointer group",
        isSelected
          ? `border-transparent ring-2 ${agent.ring} bg-card shadow-lg`
          : "border-border/50 bg-card/60 hover:bg-card hover:shadow-md hover:border-border"
      )}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Status indicator */}
      <div className="absolute top-3 right-3">
        <StatusPulse status={hasActivity ? 'in_progress' : 'idle'} pulseColor={agent.pulse} />
      </div>

      {/* Avatar */}
      <div className={cn("p-3 rounded-xl bg-gradient-to-br", agent.color, "shadow-lg")}>
        <Icon className="h-6 w-6 text-white" />
      </div>

      {/* Label */}
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">{agent.label}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{agent.role}</p>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        {activeTasks > 0 && <span className={cn("flex items-center gap-1", agent.text)}><Activity className="h-3 w-3" />{activeTasks}</span>}
        {queuedTasks > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{queuedTasks}</span>}
        {completedTasks > 0 && <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-3 w-3" />{completedTasks}</span>}
        {tasks.length === 0 && <span className="italic">Idle</span>}
      </div>
    </motion.button>
  );
}

/* ── Activity feed panel ─────────────────────────────────── */
function ActivityPanel({ agent, tasks, activities, navigate }: {
  agent: typeof AGENTS[number];
  tasks: BotTask[];
  activities: ActivityItem[];
  navigate: (path: string) => void;
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
      <div className="flex items-center gap-3 mb-4">
        <div className={cn("p-2 rounded-lg bg-gradient-to-br", agent.color)}>
          <agent.icon className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{agent.label}</h3>
          <p className="text-xs text-muted-foreground">{agent.role} — Live Activity</p>
        </div>
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
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0",
                task.status === 'in_progress' ? 'bg-amber-500/10 text-amber-500' :
                task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                task.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                'bg-muted text-muted-foreground'
              )}>{task.status.replace('_', ' ')}</span>
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
                {link && (
                  <button onClick={() => navigate(link)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <ExternalLink className="h-3 w-3" />
                  </button>
                )}
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
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentId>('clawd-main');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [bt, al] = await Promise.all([
      supabase.from('bot_tasks').select('*').order('updated_at', { ascending: false }).limit(100),
      supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    setTasks((bt.data || []) as BotTask[]);
    setActivities((al.data || []) as ActivityItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('ai-staff-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_tasks' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const agentTasks = (id: string) => tasks.filter(t => t.bot_agent === id);
  const agentActivities = (_id: string) => activities; // show all for now

  const selected = AGENTS.find(a => a.id === selectedAgent)!;
  const mainAgent = AGENTS[0];
  const childAgents = AGENTS.slice(1);

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
        <div className="rounded-xl border border-border bg-card/40 p-6 overflow-x-auto">
          <div className="flex items-center justify-center min-w-[600px]">
            {/* Main node */}
            <AgentNode
              agent={mainAgent}
              tasks={agentTasks(mainAgent.id)}
              activities={agentActivities(mainAgent.id)}
              isSelected={selectedAgent === mainAgent.id}
              onSelect={() => setSelectedAgent(mainAgent.id)}
            />

            {/* Connector to split */}
            <div className="flex flex-col items-center mx-2">
              <svg width="48" height="120" viewBox="0 0 48 120" className="overflow-visible">
                {childAgents.map((agent, i) => {
                  const y = 20 + i * 40;
                  return (
                    <g key={i} opacity={agent.connected ? 1 : 0.3}>
                      <line x1="0" y1="60" x2="24" y2="60" stroke="hsl(var(--border))" strokeWidth="1.5" strokeDasharray={agent.connected ? "0" : "4 4"} />
                      <line x1="24" y1="60" x2="24" y2={y} stroke="hsl(var(--border))" strokeWidth="1.5" strokeDasharray={agent.connected ? "0" : "4 4"} />
                      <line x1="24" y1={y} x2="48" y2={y} stroke="hsl(var(--border))" strokeWidth="1.5" strokeDasharray={agent.connected ? "0" : "4 4"} />
                      <polygon points={`42,${y-3} 48,${y} 42,${y+3}`} fill="hsl(var(--muted-foreground))" opacity="0.4" />
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Child agent nodes */}
            <div className="flex flex-col gap-3">
              {childAgents.map(agent => (
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
          </div>
        </div>

        {/* ── Detail panel ────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <ActivityPanel
            key={selected.id}
            agent={selected}
            tasks={agentTasks(selected.id)}
            activities={agentActivities(selected.id)}
            navigate={navigate}
          />
        </AnimatePresence>

        {/* ── Summary stats ───────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
