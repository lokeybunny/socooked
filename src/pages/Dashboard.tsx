import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Users, Handshake, FolderKanban, CheckSquare, DollarSign, TrendingUp, CircleCheckBig } from 'lucide-react';
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
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ customers: 0, deals: 0, projects: 0, tasks: 0, dealValue: 0, activeTasks: 0, completedTasks: 0, completedDeals: 0, completedProjects: 0 });
  const [recentCustomers, setRecentCustomers] = useState<any[]>([]);
  const [recentDeals, setRecentDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [c, d, p, t] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('deals').select('deal_value, status'),
        supabase.from('projects').select('status'),
        supabase.from('tasks').select('status'),
      ]);

      const deals = d.data || [];
      const tasks = t.data || [];
      const projects = p.data || [];

      setStats({
        customers: c.count || 0,
        deals: deals.length,
        projects: projects.length,
        tasks: tasks.length,
        dealValue: deals.reduce((sum, deal) => sum + Number(deal.deal_value || 0), 0),
        activeTasks: tasks.filter(t => t.status === 'doing').length,
        completedTasks: tasks.filter(t => t.status === 'done').length,
        completedDeals: deals.filter(d => d.status === 'won').length,
        completedProjects: projects.filter(p => (p as any).status === 'completed').length,
      });

      const [rc, rd] = await Promise.all([
        supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('deals').select('*').order('created_at', { ascending: false }).limit(5),
      ]);

      setRecentCustomers(rc.data || []);
      setRecentDeals(rd.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const metricCards = [
    { label: 'Total Customers', value: stats.customers, icon: Users, color: 'text-blue-500' },
    { label: 'Active Deals', value: stats.deals, icon: Handshake, color: 'text-emerald-500' },
    { label: 'Pipeline Value', value: `$${stats.dealValue.toLocaleString()}`, icon: DollarSign, color: 'text-amber-500' },
    { label: 'Projects', value: stats.projects, icon: FolderKanban, color: 'text-purple-500' },
    { label: 'Total Tasks', value: stats.tasks, icon: CheckSquare, color: 'text-cyan-500' },
    { label: 'In Progress', value: stats.activeTasks, icon: TrendingUp, color: 'text-orange-500' },
  ];

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}.</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {metricCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="metric-card">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg bg-muted ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">{loading ? '—' : value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="text-center space-y-1">
              <p className="text-3xl font-bold text-foreground">{loading ? '—' : stats.completedTasks}</p>
              <p className="text-xs text-muted-foreground">Tasks Done</p>
              {stats.tasks > 0 && !loading && (
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.round((stats.completedTasks / stats.tasks) * 100)}%` }} />
                </div>
              )}
            </div>
            <div className="text-center space-y-1">
              <p className="text-3xl font-bold text-foreground">{loading ? '—' : stats.completedDeals}</p>
              <p className="text-xs text-muted-foreground">Deals Won</p>
              {stats.deals > 0 && !loading && (
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.round((stats.completedDeals / stats.deals) * 100)}%` }} />
                </div>
              )}
            </div>
            <div className="text-center space-y-1">
              <p className="text-3xl font-bold text-foreground">{loading ? '—' : stats.completedProjects}</p>
              <p className="text-xs text-muted-foreground">Projects Completed</p>
              {stats.projects > 0 && !loading && (
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.round((stats.completedProjects / stats.projects) * 100)}%` }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
