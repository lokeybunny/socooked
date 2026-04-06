import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Users, TrendingUp, Mail, Clock, RefreshCw, Layers, CircleCheckBig, DollarSign } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/hooks/useAuth';
import FinancialReports from '@/components/dashboard/FinancialReports';
import ArtistContinueBanner from '@/components/smm/ArtistContinueBanner';

interface Stats {
  customers: number;
  prospectCount: number;
  prospectEmailedCount: number;
  monthlyCount: number;
  clientCount: number;
  actualTotalCustomers: number;
  paidConvertedCount: number;
  emailsToday: number;
  arbPurchasedCount: number;
  arbPurchasedSpread: number;
  arbListedSpread: number;
  arbSoldCount: number;
  arbSoldSpread: number;
}

const CRYPTO_TOKEN_ADDRESS = '7oXNE1dbpHUp6dn1JF8pRgCtzfCy4P2FuBneWjZHpump';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ customers: 0, prospectCount: 0, prospectEmailedCount: 0, monthlyCount: 0, clientCount: 0, actualTotalCustomers: 0, paidConvertedCount: 0, emailsToday: 0, arbPurchasedCount: 0, arbPurchasedSpread: 0, arbListedSpread: 0 });
  const [recentCustomers, setRecentCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vegasTime, setVegasTime] = useState('');
  const [cronCountdown, setCronCountdown] = useState(0);
  const [cryptoHoldingUsd, setCryptoHoldingUsd] = useState(0);

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

  useEffect(() => {
    let cancelled = false;

    const loadCachedCrypto = () => {
      try {
        const directRaw = localStorage.getItem('crypto_holding_usd');
        if (directRaw) {
          const parsed = JSON.parse(directRaw);
          const cachedValue = Number(parsed?.value ?? 0);
          if (Number.isFinite(cachedValue)) {
            setCryptoHoldingUsd(cachedValue);
            return;
          }
        }

        const walletCacheRaw = localStorage.getItem('crypto_wallet_cache_v2');
        if (walletCacheRaw) {
          const parsed = JSON.parse(walletCacheRaw);
          const cachedValue = Number(parsed?.totals?.holdingValueUsd ?? 0);
          if (Number.isFinite(cachedValue)) {
            setCryptoHoldingUsd(cachedValue);
          }
        }
      } catch {}
    };

    const refreshCryptoHolding = async () => {
      if (!user) return;

      try {
        const { data: walletRows, error: walletError } = await supabase
          .from('crypto_wallets')
          .select('wallet_address')
          .eq('token_address', CRYPTO_TOKEN_ADDRESS)
          .eq('is_active', true);

        if (walletError) throw walletError;

        const walletAddresses = (walletRows || [])
          .map((wallet) => wallet.wallet_address)
          .filter(Boolean);

        if (!walletAddresses.length) {
          if (!cancelled) setCryptoHoldingUsd(0);
          try {
            localStorage.removeItem('crypto_holding_usd');
            localStorage.removeItem('crypto_wallet_cache_v2');
          } catch {}
          return;
        }

        const { data, error } = await supabase.functions.invoke('crypto-wallets', {
          body: {
            wallets: walletAddresses,
            token_mint: CRYPTO_TOKEN_ADDRESS,
          },
        });

        if (error) throw error;

        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        const nextValue = Number(parsed?.totals?.holdingValueUsd ?? 0);
        if (!Number.isFinite(nextValue) || cancelled) return;

        setCryptoHoldingUsd(nextValue);
        try {
          localStorage.setItem('crypto_holding_usd', JSON.stringify({ value: nextValue, ts: Date.now() }));
        } catch {}
      } catch (error) {
        console.error('Failed to refresh dashboard crypto:', error);
      }
    };

    loadCachedCrypto();
    void refreshCryptoHolding();

    const interval = window.setInterval(() => {
      void refreshCryptoHolding();
    }, 120_000);

    const handleFocus = () => {
      void refreshCryptoHolding();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  const formatCountdown = useCallback((s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    async function load() {
      const [prospectsRes, prospectEmailedRes, monthlyRes, clientRes, comms, invoicesRes, rc, arbPurchasedRes, arbListedRes] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'prospect'),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'prospect_emailed'),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'monthly'),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('communications').select('type, created_at'),
        supabase.from('invoices').select('customer_id, status'),
        supabase.from('customers').select('*').neq('category', 'potential').order('created_at', { ascending: false }).limit(5),
        supabase.from('arbitrage_items').select('asking_price, wiggle_room_price').eq('status', 'purchased'),
        supabase.from('arbitrage_items').select('asking_price, wiggle_room_price').eq('status', 'listed'),
        supabase.from('arbitrage_items').select('asking_price, wiggle_room_price, meta').eq('status', 'sold'),
      ]);

      const allComms = comms.data || [];
      const today = new Date().toISOString().slice(0, 10);
      const prospectCount = prospectsRes.count || 0;
      const prospectEmailedCount = prospectEmailedRes.count || 0;
      const monthlyCount = monthlyRes.count || 0;
      const clientCount = clientRes.count || 0;

      // Arbitrage metrics
      const arbPurchased = arbPurchasedRes.data || [];
      const arbPurchasedCount = arbPurchased.length;
      const arbPurchasedSpread = arbPurchased.reduce((sum, i) => sum + ((i.wiggle_room_price || 0) - (i.asking_price || 0)), 0);
      const arbListed = arbListedRes.data || [];
      const arbListedSpread = arbListed.reduce((sum, i) => sum + ((i.wiggle_room_price || 0) - (i.asking_price || 0)), 0);

      // Actual lead conversion: monthly/active customers where ALL invoices are paid
      const allInvoices = invoicesRes.data || [];
      const [monthlyCustomers, activeCustomers] = await Promise.all([
        supabase.from('customers').select('id').eq('status', 'monthly'),
        supabase.from('customers').select('id').eq('status', 'active'),
      ]);
      const convertedIds = new Set([
        ...(monthlyCustomers.data || []).map((c: any) => c.id),
        ...(activeCustomers.data || []).map((c: any) => c.id),
      ]);

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
        prospectEmailedCount,
        monthlyCount,
        clientCount,
        actualTotalCustomers: convertedIds.size + arbPurchasedCount,
        paidConvertedCount,
        emailsToday: allComms.filter(c => c.type === 'email' && c.created_at.startsWith(today)).length,
        arbPurchasedCount,
        arbPurchasedSpread,
        arbListedSpread,
      });

      setRecentCustomers(rc.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const metricCards = [
    { label: 'Prospects in Pipeline', value: stats.prospectCount + stats.prospectEmailedCount, subtitle: `${stats.prospectCount} pending + ${stats.prospectEmailedCount} AI completed`, icon: Users, color: 'text-blue-500' },
    { label: 'Actual Total Customers', value: stats.actualTotalCustomers, subtitle: `${stats.clientCount} new + ${stats.monthlyCount} monthly + ${stats.arbPurchasedCount} arb purchased`, icon: Users, color: 'text-emerald-500' },
    { label: 'Current Recurring Monthly Revenue', value: `$${(stats.monthlyCount * 250).toLocaleString()}`, subtitle: `${stats.monthlyCount} monthly clients × $250/mo`, icon: DollarSign, color: 'text-amber-500' },
    { label: 'Potential Lead Conversion + Crypto', value: `$${((stats.prospectCount + stats.prospectEmailedCount) * 250 + stats.arbListedSpread + cryptoHoldingUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, subtitle: `${stats.prospectCount + stats.prospectEmailedCount} prospects × $250 + $${stats.arbListedSpread.toLocaleString()} arb + $${cryptoHoldingUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} crypto`, icon: TrendingUp, color: 'text-green-500' },
    { label: 'Actual Lead Conversion', value: `$${(stats.paidConvertedCount * 350 + stats.arbPurchasedSpread).toLocaleString()}`, subtitle: `${stats.paidConvertedCount} clients × $350 + $${stats.arbPurchasedSpread.toLocaleString()} arb profit`, icon: CircleCheckBig, color: 'text-emerald-500' },
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

        {/* Artist Campaign Continuation Prompts */}
        <ArtistContinueBanner />

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

        {/* Financial Reports */}
        <FinancialReports />

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
