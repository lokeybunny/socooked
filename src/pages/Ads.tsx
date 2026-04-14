import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Globe, Video, Facebook, Search, Phone, TrendingUp,
  Settings, CheckCircle2, AlertCircle, ArrowRight, Activity,
  DollarSign, BarChart3, Zap, ExternalLink, ChevronRight,
  Megaphone, Bot, MapPin, Key, Link2, Eye,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/* ─── Channel definitions ─────────────────────────────────── */
interface Channel {
  id: string;
  label: string;
  desc: string;
  icon: typeof Globe;
  color: string;
  ring: string;
  bg: string;
  text: string;
  pulse: string;
  status: 'connected' | 'setup_required' | 'active';
  apiKeyName?: string;
  setupUrl?: string;
  features: string[];
}

const WEB_CHANNELS: Channel[] = [
  {
    id: 'facebook',
    label: 'Facebook Ads',
    desc: 'Meta Business — Lead Gen & Retargeting',
    icon: Facebook,
    color: 'from-blue-600 to-blue-700',
    ring: 'ring-blue-500/30',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    pulse: 'bg-blue-500',
    status: 'setup_required',
    apiKeyName: 'META_ACCESS_TOKEN',
    setupUrl: 'https://business.facebook.com/settings',
    features: ['Daily ad spend tracking', 'Lead conversion funnel', 'Audience retargeting', 'Campaign performance metrics'],
  },
  {
    id: 'craigslist',
    label: 'Craigslist',
    desc: 'Organic Outreach — Local Posting',
    icon: MapPin,
    color: 'from-purple-500 to-violet-600',
    ring: 'ring-purple-500/30',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    pulse: 'bg-purple-500',
    status: 'active',
    features: ['Auto-post to target cities', 'Template rotation', 'Reply monitoring', 'Lead capture integration'],
  },
  {
    id: 'ai-cold-call',
    label: 'AI Cold Calling',
    desc: 'Vapi.AI — Automated Outreach',
    icon: Phone,
    color: 'from-emerald-500 to-teal-600',
    ring: 'ring-emerald-500/30',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    pulse: 'bg-emerald-500',
    status: 'active',
    features: ['Power dialer campaigns', 'AI sentiment analysis', 'Scheduled call windows (PST)', 'Auto-funnel routing'],
  },
];

const VIDEO_CHANNELS: Channel[] = [
  {
    id: 'google-ads',
    label: 'Google Ads',
    desc: 'Search & Display — Videography Leads',
    icon: Search,
    color: 'from-red-500 to-orange-600',
    ring: 'ring-red-500/30',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    pulse: 'bg-red-500',
    status: 'setup_required',
    apiKeyName: 'GOOGLE_ADS_API_KEY',
    setupUrl: 'https://ads.google.com',
    features: ['Daily spend & CPC tracking', 'Search term performance', 'Conversion tracking', 'Budget pacing alerts'],
  },
];

/* ─── Business Track ──────────────────────────────────────── */
interface TrackProps {
  title: string;
  subtitle: string;
  icon: typeof Globe;
  gradient: string;
  channels: Channel[];
  selectedChannel: string | null;
  onSelectChannel: (id: string) => void;
}

function BusinessTrack({ title, subtitle, icon: TrackIcon, gradient, channels, selectedChannel, onSelectChannel }: TrackProps) {
  return (
    <div className="space-y-4">
      {/* Track header */}
      <div className="flex items-center gap-3">
        <div className={cn('p-2.5 rounded-xl bg-gradient-to-br shadow-lg', gradient)}>
          <TrackIcon className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground tracking-wide">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {/* Channel cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {channels.map((ch) => {
          const Icon = ch.icon;
          const isSelected = selectedChannel === ch.id;
          return (
            <motion.button
              key={ch.id}
              onClick={() => onSelectChannel(ch.id)}
              className={cn(
                'relative flex flex-col gap-3 p-4 rounded-xl border transition-all duration-300 text-left cursor-pointer group',
                isSelected
                  ? `border-transparent ring-2 ${ch.ring} bg-card shadow-lg`
                  : 'border-border/50 bg-card/60 hover:bg-card hover:shadow-md hover:border-border',
              )}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Status dot */}
              <div className="absolute top-3 right-3">
                <span className="relative flex h-2.5 w-2.5">
                  {ch.status === 'active' && <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', ch.pulse)} />}
                  <span className={cn(
                    'relative inline-flex rounded-full h-2.5 w-2.5',
                    ch.status === 'active' ? ch.pulse : ch.status === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                  )} />
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-lg bg-gradient-to-br', ch.color, 'shadow-lg')}>
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">{ch.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{ch.desc}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[10px]">
                {ch.status === 'active' ? (
                  <span className={cn('flex items-center gap-1', ch.text)}>
                    <Activity className="h-3 w-3" /> Live
                  </span>
                ) : ch.status === 'connected' ? (
                  <span className="flex items-center gap-1 text-emerald-500">
                    <CheckCircle2 className="h-3 w-3" /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <AlertCircle className="h-3 w-3" /> Setup required
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Channel Detail Panel ────────────────────────────────── */
function ChannelDetail({ channel, onConnect }: { channel: Channel; onConnect: (id: string, key: string) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const Icon = channel.icon;

  const handleConnect = async () => {
    if (!apiKey.trim()) { toast.error('Please enter an API key'); return; }
    setConnecting(true);
    // Simulate — in production this stores via edge function
    await new Promise(r => setTimeout(r, 1200));
    onConnect(channel.id, apiKey.trim());
    setApiKey('');
    setConnecting(false);
    toast.success(`${channel.label} connected successfully`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="rounded-xl border border-border bg-card p-5 space-y-5"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={cn('p-2.5 rounded-xl bg-gradient-to-br shadow-lg', channel.color)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{channel.label}</h3>
          <p className="text-xs text-muted-foreground">{channel.desc}</p>
        </div>
        <div className="ml-auto">
          <span className={cn(
            'text-[10px] px-2.5 py-1 rounded-full capitalize',
            channel.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' :
            channel.status === 'connected' ? 'bg-blue-500/10 text-blue-500' :
            'bg-muted text-muted-foreground',
          )}>{channel.status.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Features */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Capabilities</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {channel.features.map((f, i) => (
            <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/40">
              <ChevronRight className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', channel.text)} />
              <span className="text-xs text-foreground/80">{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* API Setup (if needed) */}
      {channel.apiKeyName && channel.status === 'setup_required' && (
        <div className="space-y-3 p-4 rounded-lg border border-dashed border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <Key className={cn('h-4 w-4', channel.text)} />
            <p className="text-xs font-medium text-foreground">Connect Your {channel.label} Account</p>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Enter your API key to enable real-time spend tracking and campaign metrics.
            {channel.setupUrl && (
              <> Get your credentials at{' '}
                <a href={channel.setupUrl} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2 hover:text-primary transition-colors inline-flex items-center gap-0.5">
                  {channel.label} Dashboard <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`Paste your ${channel.apiKeyName}`}
              className="h-9 text-xs flex-1"
            />
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={connecting}
              className="h-9 text-xs"
            >
              {connecting ? 'Connecting…' : 'Connect'}
              <Link2 className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Spend placeholder (when connected) */}
      {(channel.status === 'active' || channel.status === 'connected') && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Today Spend', value: '—', icon: DollarSign },
            { label: 'Impressions', value: '—', icon: Eye },
            { label: 'Leads', value: '—', icon: TrendingUp },
          ].map((m) => (
            <div key={m.label} className="p-3 rounded-lg bg-muted/40 text-center">
              <m.icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-lg font-semibold text-foreground">{m.value}</p>
              <p className="text-[10px] text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Quick links for active channels */}
      {channel.id === 'ai-cold-call' && (
        <div className="flex gap-2">
          <a href="/powerdial" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/60">
            <Phone className="h-3.5 w-3.5" /> Open Power Dialer
            <ArrowRight className="h-3 w-3" />
          </a>
          <a href="/funnels" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/60">
            <Zap className="h-3.5 w-3.5" /> Funnels Pipeline
            <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      )}
      {channel.id === 'craigslist' && (
        <div className="flex gap-2">
          <a href="/leads" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/60">
            <MapPin className="h-3.5 w-3.5" /> Leads Manager
            <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      )}
    </motion.div>
  );
}

/* ─── Flow connector SVG ──────────────────────────────────── */
function FlowArrow() {
  return (
    <div className="flex items-center justify-center py-2">
      <svg width="2" height="32" className="overflow-visible">
        <line x1="1" y1="0" x2="1" y2="32" stroke="hsl(var(--border))" strokeWidth="2" strokeDasharray="4 4" />
      </svg>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────── */
export default function Ads() {
  const [selectedChannel, setSelectedChannel] = useState<string | null>('facebook');
  const allChannels = [...WEB_CHANNELS, ...VIDEO_CHANNELS];
  const activeChannel = allChannels.find(c => c.id === selectedChannel) || null;

  // Simulated channel state (would come from Supabase in production)
  const [channelStates, setChannelStates] = useState<Record<string, Channel['status']>>({});

  const handleConnect = (id: string, _key: string) => {
    setChannelStates(prev => ({ ...prev, [id]: 'connected' }));
  };

  const getChannel = (ch: Channel): Channel => ({
    ...ch,
    status: channelStates[ch.id] || ch.status,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Page header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Megaphone className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold text-foreground tracking-tight">Advertisement Hub</h1>
          </div>
          <p className="text-xs text-muted-foreground/70">
            Marketing channels across Web Design &amp; Videography businesses — connect APIs to track live spend.
          </p>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Active Channels', value: String(allChannels.filter(c => (channelStates[c.id] || c.status) !== 'setup_required').length), icon: Activity, accent: 'text-emerald-500' },
            { label: 'Setup Required', value: String(allChannels.filter(c => (channelStates[c.id] || c.status) === 'setup_required').length), icon: AlertCircle, accent: 'text-amber-500' },
            { label: 'Total Spend Today', value: '—', icon: DollarSign, accent: 'text-foreground' },
            { label: 'Total Leads Today', value: '—', icon: BarChart3, accent: 'text-foreground' },
          ].map((s) => (
            <div key={s.label} className="p-3.5 rounded-xl border border-border/50 bg-card/60">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{s.label}</p>
              </div>
              <p className={cn('text-xl font-semibold', s.accent)}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Web Business Track */}
        <BusinessTrack
          title="Web Design Business"
          subtitle="Facebook Marketing · Craigslist · AI Cold Calling"
          icon={Globe}
          gradient="from-cyan-500 to-blue-600"
          channels={WEB_CHANNELS.map(getChannel)}
          selectedChannel={selectedChannel}
          onSelectChannel={setSelectedChannel}
        />

        <FlowArrow />

        {/* Videography Track */}
        <BusinessTrack
          title="Videography Business"
          subtitle="Google Ads — Search & Display"
          icon={Video}
          gradient="from-red-500 to-orange-600"
          channels={VIDEO_CHANNELS.map(getChannel)}
          selectedChannel={selectedChannel}
          onSelectChannel={setSelectedChannel}
        />

        {/* Detail panel */}
        <AnimatePresence mode="wait">
          {activeChannel && (
            <ChannelDetail
              key={activeChannel.id}
              channel={getChannel(activeChannel)}
              onConnect={handleConnect}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
