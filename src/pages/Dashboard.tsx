import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Users, TrendingUp, Mail, Clock, RefreshCw, Layers, CircleCheckBig } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/hooks/useAuth';

interface Stats {
  customers: number;
  prospectCount: number;
  monthlyCount: number;
  clientCount: number;
  actualTotalCustomers: number;
  paidConvertedCount: number;
  emailsToday: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ customers: 0, prospectCount: 0, monthlyCount: 0, clientCount: 0, actualTotalCustomers: 0, paidConvertedCount: 0, emailsToday: 0 });
  const [recentCustomers, setRecentCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vegasTime, setVegasTime] = useState('');
  const [cronCountdown, setCronCountdown] = useState(0);

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
      const vegasNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
      const minutes = vegasNow.getMinutes();
      const seconds = vegasNow.getSeconds();
      const totalSeconds = minutes * 60 + seconds;
      const intervalSeconds = 3 * 60;
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
      const [prospectsRes, monthlyRes, clientRes, comms, invoicesRes, rc] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'prospect'),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'monthly'),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('communications').select('type, created_at'),
        supabase.from('invoices').select('customer_id, status'),
        supabase.from('customers').select('*').neq('category', 'potential').order('created_at', { ascending: false }).limit(5),
      ]);

      const allComms = comms.data || [];
      const today = new Date().toISOString().slice(0, 10);
      const prospectCount = prospectsRes.count || 0;
      const monthlyCount = monthlyRes.count || 0;
      const clientCount = clientRes.count || 0;

      // Actual lead conversion: monthly/active customers where ALL invoices are paid
      const allInvoices = invoicesRes.data || [];
      // Get all monthly + active customer IDs
      const [monthlyCustomers, activeCustomers] = await Promise.all([
        supabase.from('customers').select('id').eq('status', 'monthly'),
        supabase.from('customers').select('id').eq('status', 'active'),
      ]);
      const convertedIds = new Set([
        ...(monthlyCustomers.data || []).map((c: any) => c.id),
        ...(activeCustomers.data || []).map((c: any) => c.id),
      ]);

      // For each converted customer, check if they have at least one invoice and all are paid
      const invoicesByCustomer = new Map<string, boolean>();
      for (const inv of allInvoices) {
        const cid = inv.customer_id;
        if (!convertedIds.has(cid)) continue;
        if (!invoicesByCustomer.has(cid)) invoicesByCustomer.set(cid, true);
        if (inv.status !== 'paid') invoicesByCustomer.set(cid, false);
      }

      let paidConvertedCount = 0;
      invoicesByCustomer.forEach((allPaid) => { if (allPaid) paidConvertedCount++; });

      setStats({
        customers: prospectCount,
        prospectCount,
        monthlyCount,
        clientCount,
        actualTotalCustomers: convertedIds.size,
        paidConvertedCount,
        emailsToday: allComms.filter(c => c.type === 'email' && c.created_at.startsWith(today)).length,
      });

      setRecentCustomers(rc.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const metricCards = [
    { label: 'Prospects in Pipeline', value: stats.customers, icon: Users, color: 'text-blue-500' },
    { label: 'Actual Total Customers', value: stats.actualTotalCustomers, subtitle: `${stats.clientCount} new + ${stats.monthlyCount} monthly (deduplicated)`, icon: Users, color: 'text-emerald-500' },
    { label: 'Potential Lead Conversion', value: `$${(stats.prospectCount * 350).toLocaleString()}`, subtitle: `${stats.prospectCount} prospects (pending websites) × $350`, icon: TrendingUp, color: 'text-green-500' },
    { label: 'Actual Lead Conversion', value: `$${(stats.paidConvertedCount * 350).toLocaleString()}`, subtitle: `${stats.paidConvertedCount} invoiced & paid clients × $350`, icon: CircleCheckBig, color: 'text-emerald-500' },
    { label: 'Monthly Clients Revenue', value: `$${(stats.monthlyCount * 350).toLocaleString()}`, subtitle: `${stats.monthlyCount} monthly clients × $350`, icon: Layers, color: 'text-emerald-500' },
    { label: 'Emails Today', value: stats.emailsToday, icon: Mail, color: 'text-rose-500' },
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
            <div className="flex items-center gap-1.5 text-right">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="text-xs font-mono font-semibold text-foreground leading-tight">{vegasTime}</p>
                <p className="text-[9px] text-muted-foreground leading-tight">Las Vegas</p>
              </div>
            </div>
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
      </div>
    </AppLayout>
  );
}
