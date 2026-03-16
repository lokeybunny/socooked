import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Users, Handshake, FolderKanban, CheckSquare, DollarSign, TrendingUp, CircleCheckBig, Mail, Phone, MessageSquareText, Clock, RefreshCw, Smartphone, MapPin, Globe, Building } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/hooks/useAuth';

interface Stats {
  customers: number;
  deals: number;
  projects: number;
  tasks: number;
  dealValue: number;
  activeTasks: number;
  completedTasks: number;
  completedDeals: number;
  completedProjects: number;
  emailsToday: number;
  totalEmails: number;
  totalCalls: number;
  totalSms: number;
  prospectCount: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ customers: 0, deals: 0, projects: 0, tasks: 0, dealValue: 0, activeTasks: 0, completedTasks: 0, completedDeals: 0, completedProjects: 0, emailsToday: 0, totalEmails: 0, totalCalls: 0, totalSms: 0, prospectCount: 0 });
  const [recentCustomers, setRecentCustomers] = useState<any[]>([]);
  const [recentDeals, setRecentDeals] = useState<any[]>([]);
  const [potentialLeads, setPotentialLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vegasTime, setVegasTime] = useState('');
  const [cronCountdown, setCronCountdown] = useState(0);

  // Las Vegas clock (server time = PST)
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setVegasTime(now.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }));
      // Cron runs every 3 min (*/3 * * * *), countdown = seconds until next 3-min mark
      const vegasNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
      const minutes = vegasNow.getMinutes();
      const seconds = vegasNow.getSeconds();
      const totalSeconds = minutes * 60 + seconds;
      const intervalSeconds = 3 * 60; // 3 minutes
      const secondsIntoInterval = totalSeconds % intervalSeconds;
      const remaining = intervalSeconds - secondsIntoInterval;
      setCronCountdown(remaining);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatCountdown = useCallback((s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    async function load() {
      const [cReal, cPotential, d, p, t, comms, activeDealsRes, prospectsRes] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'prospect'),
        supabase.from('customers').select('id, full_name, email, company, status, source, created_at, category').eq('category', 'potential').order('created_at', { ascending: false }),
        supabase.from('deals').select('deal_value, status'),
        supabase.from('projects').select('status'),
        supabase.from('tasks').select('status'),
        supabase.from('communications').select('type, created_at'),
        supabase.from('deals').select('id, customer_id, status').eq('status', 'won'),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'prospect'),
      ]);

      const deals = d.data || [];
      const tasks = t.data || [];
      const projects = p.data || [];
      const allComms = comms.data || [];
      const potentialList = cPotential.data || [];
      const wonDeals = activeDealsRes.data || [];
      const today = new Date().toISOString().slice(0, 10);

      // Active deals = won deals where customer is in "potential" category
      const potentialIds = new Set(potentialList.map(c => c.id));
      const activeDealsCount = wonDeals.filter(d => potentialIds.has(d.customer_id)).length;

      setStats({
        customers: cReal.count || 0,
        deals: activeDealsCount,
        projects: projects.length,
        tasks: tasks.length,
        dealValue: deals.reduce((sum, deal) => sum + Number(deal.deal_value || 0), 0),
        activeTasks: tasks.filter(t => t.status === 'doing').length,
        completedTasks: tasks.filter(t => t.status === 'done').length,
        completedDeals: deals.filter(d => d.status === 'won').length,
        completedProjects: projects.filter(p => (p as any).status === 'completed').length,
        emailsToday: allComms.filter(c => c.type === 'email' && c.created_at.startsWith(today)).length,
        totalEmails: allComms.filter(c => c.type === 'email').length,
        totalCalls: allComms.filter(c => c.type === 'call').length,
        totalSms: allComms.filter(c => c.type === 'sms').length,
        prospectCount: prospectsRes.count || 0,
      });

      setPotentialLeads(potentialList);

      const [rc, rd] = await Promise.all([
        supabase.from('customers').select('*').neq('category', 'potential').order('created_at', { ascending: false }).limit(5),
        supabase.from('deals').select('*').order('created_at', { ascending: false }).limit(5),
      ]);

      setRecentCustomers(rc.data || []);
      setRecentDeals(rd.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const metricCards = [
    { label: 'Potential Total Customers', value: stats.customers, icon: Users, color: 'text-blue-500' },
    { label: 'Active Deals', value: stats.deals, icon: Handshake, color: 'text-emerald-500' },
    { label: 'Pipeline Value', value: `$${stats.dealValue.toLocaleString()}`, icon: DollarSign, color: 'text-amber-500' },
    { label: 'Potential Lead Conversion', value: `$${(stats.prospectCount * 250).toLocaleString()}`, subtitle: `${stats.prospectCount} prospects × $250`, icon: TrendingUp, color: 'text-green-500' },
    { label: 'Total Tasks', value: stats.tasks, icon: CheckSquare, color: 'text-cyan-500' },
    { label: 'In Progress', value: stats.activeTasks, icon: TrendingUp, color: 'text-orange-500' },
    { label: 'Emails Today', value: stats.emailsToday, icon: Mail, color: 'text-rose-500' },
    { label: 'Total Calls', value: stats.totalCalls, icon: Phone, color: 'text-teal-500' },
    { label: 'Total SMS', value: stats.totalSms, icon: MessageSquareText, color: 'text-indigo-500' },
  ];

  return (
    <AppLayout>
      <div className="space-y-5 sm:space-y-8 animate-fade-in">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Welcome back{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}.</p>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Las Vegas Clock */}
            <div className="flex items-center gap-1.5 text-right">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="text-xs font-mono font-semibold text-foreground leading-tight">{vegasTime}</p>
                <p className="text-[9px] text-muted-foreground leading-tight">Las Vegas</p>
              </div>
            </div>
            {/* Cron Countdown */}
            <div className="flex items-center gap-1.5 text-right">
              <RefreshCw className={`h-3.5 w-3.5 ${cronCountdown <= 10 ? 'text-emerald-500 animate-spin' : 'text-muted-foreground'}`} style={cronCountdown <= 10 ? { animationDuration: '2s' } : {}} />
              <div>
                <p className="text-xs font-mono font-semibold text-foreground leading-tight">{formatCountdown(cronCountdown)}</p>
                <p className="text-[9px] text-muted-foreground leading-tight">Gmail Poll</p>
              </div>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {metricCards.map(({ label, value, icon: Icon, color, subtitle }) => (
            <div key={label} className="metric-card">
              <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                <div className={`p-1.5 sm:p-2 rounded-lg bg-muted ${color}`}>
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-foreground">{loading ? '—' : value}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">{label}</p>
              {subtitle && <p className="text-[9px] sm:text-[10px] text-muted-foreground/70 mt-0.5">{subtitle}</p>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Recent Customers */}
          <div className="glass-card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Recent Customers</h2>
            {recentCustomers.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground">No customers yet. Add your first customer!</p>
            ) : (
              <div className="space-y-3">
                {recentCustomers.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.full_name}</p>
                      <p className="text-xs text-muted-foreground">{c.email || c.company || '—'}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Deals */}
          <div className="glass-card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Recent Deals</h2>
            {recentDeals.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground">No deals yet. Create your first deal!</p>
            ) : (
              <div className="space-y-3">
                {recentDeals.map(d => (
                  <div key={d.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{d.title}</p>
                      <p className="text-xs text-muted-foreground">${Number(d.deal_value).toLocaleString()}</p>
                    </div>
                    <StatusBadge status={d.stage} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Completed Overview */}
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <CircleCheckBig className="h-4 w-4 text-emerald-500" />
            Completed
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:gap-6">
            <div className="text-center space-y-1">
              <p className="text-xl sm:text-3xl font-bold text-foreground">{loading ? '—' : stats.completedTasks}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Tasks Done</p>
              {stats.tasks > 0 && !loading && (
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.round((stats.completedTasks / stats.tasks) * 100)}%` }} />
                </div>
              )}
            </div>
            <div className="text-center space-y-1">
              <p className="text-xl sm:text-3xl font-bold text-foreground">{loading ? '—' : stats.completedDeals}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Deals Won</p>
              {stats.deals > 0 && !loading && (
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.round((stats.completedDeals / stats.deals) * 100)}%` }} />
                </div>
              )}
            </div>
            <div className="text-center space-y-1">
              <p className="text-xl sm:text-3xl font-bold text-foreground">{loading ? '—' : stats.completedProjects}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Projects Completed</p>
              {stats.projects > 0 && !loading && (
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.round((stats.completedProjects / stats.projects) * 100)}%` }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Potential Leads Section */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-amber-500" />
              Potential Leads
            </h2>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500">
              {loading ? '—' : potentialLeads.length}
            </span>
          </div>
          {potentialLeads.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground">No potential leads yet. They'll appear here from your lead finder tools.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {potentialLeads.slice(0, 12).map(lead => {
                const sourceIcon = lead.source === 'google-maps' ? MapPin :
                                   lead.source === 'yelp' ? Globe : Building;
                const SourceIcon = sourceIcon;
                return (
                  <div key={lead.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
                    <div className="p-1.5 rounded-md bg-amber-500/10 mt-0.5">
                      <SourceIcon className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{lead.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{lead.company || lead.email || '—'}</p>
                      {lead.source && (
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5 capitalize">{lead.source.replace(/-/g, ' ')}</p>
                      )}
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>
                );
              })}
            </div>
          )}
          {potentialLeads.length > 12 && (
            <p className="text-xs text-muted-foreground mt-3 text-center">+ {potentialLeads.length - 12} more potential leads</p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
