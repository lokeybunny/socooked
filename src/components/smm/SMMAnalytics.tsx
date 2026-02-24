import { useEffect, useState } from 'react';
import type { SMMProfile, AnalyticsData, Platform } from '@/lib/smm/types';
import { useSMMContext, PLATFORM_META } from '@/lib/smm/context';
import { smmApi } from '@/lib/smm/store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Users, Eye, Target, Heart, MessageSquare, Share2, Bookmark, BarChart3, Columns } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const CHART_COLORS = ['hsl(var(--primary))', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899'];

function StatCard({ label, value, icon: Icon, subtitle }: { label: string; value: string | number; icon: any; subtitle?: string }) {
  return (
    <div className="glass-card p-4 flex items-center gap-3">
      <Icon className="h-5 w-5 text-primary shrink-0" />
      <div>
        <p className="text-lg font-bold text-foreground">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function SMMAnalytics({ profiles }: { profiles: SMMProfile[] }) {
  const { profileId } = useSMMContext();
  const [localProfileId, setLocalProfileId] = useState(profileId || profiles[0]?.id || '');
  const [data, setData] = useState<AnalyticsData[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [compareMode, setCompareMode] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!localProfileId) return;
    setLoading(true);
    smmApi.getAnalytics(localProfileId).then(d => { setData(d); setLoading(false); });
  }, [localProfileId]);

  const filtered = selectedPlatform === 'all' ? data : data.filter(d => d.platform === selectedPlatform);
  const totals = filtered.reduce((acc, d) => ({
    followers: acc.followers + d.followers, impressions: acc.impressions + d.impressions,
    reach: acc.reach + d.reach, likes: acc.likes + d.likes, comments: acc.comments + d.comments,
    shares: acc.shares + d.shares, saves: acc.saves + d.saves,
  }), { followers: 0, impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0 });

  const chartData = filtered.length > 0 ? filtered[0].series.map((_, i) => {
    const point: any = { date: filtered[0].series[i].date.slice(5) };
    filtered.forEach(d => {
      point[`${d.platform}_imp`] = d.series[i]?.impressions || 0;
      point[`${d.platform}_eng`] = d.series[i]?.engagement || 0;
    });
    return point;
  }) : [];

  const platforms = data.map(d => d.platform);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Profile</Label>
          <Select value={localProfileId} onValueChange={setLocalProfileId}>
            <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.username}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Platform</Label>
          <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {platforms.map(p => <SelectItem key={p} value={p}>{PLATFORM_META[p]?.label || p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant={compareMode ? 'default' : 'outline'} size="sm" className="h-8 gap-1 text-xs" onClick={() => setCompareMode(!compareMode)}>
          <Columns className="h-3 w-3" /> {compareMode ? 'Compare On' : 'Compare'}
        </Button>
      </div>

      {compareMode && data.length > 1 ? (
        /* Compare Mode: side-by-side platform cards */
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.map(d => {
              const meta = PLATFORM_META[d.platform];
              return (
                <div key={d.platform} className="glass-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${meta?.color}`}>{meta?.abbr}</span>
                    <span className="text-sm font-medium">{meta?.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><p className="text-muted-foreground">Followers</p><p className="font-bold text-foreground">{d.followers.toLocaleString()}</p></div>
                    <div><p className="text-muted-foreground">Impressions</p><p className="font-bold text-foreground">{d.impressions.toLocaleString()}</p></div>
                    <div><p className="text-muted-foreground">Reach</p><p className="font-bold text-foreground">{d.reach.toLocaleString()}</p></div>
                    <div><p className="text-muted-foreground">Engagement</p><p className="font-bold text-foreground">{(d.likes + d.comments + d.shares).toLocaleString()}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Combined chart */}
          {chartData.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Platform Comparison – 14 Day</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Legend />
                  {data.map((d, i) => (
                    <Line key={d.platform} type="monotone" dataKey={`${d.platform}_imp`} name={`${PLATFORM_META[d.platform]?.abbr} impressions`}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : (
        /* Normal Mode */
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatCard label="Followers" value={totals.followers} icon={Users} />
            <StatCard label="Impressions" value={totals.impressions} icon={Eye} />
            <StatCard label="Reach" value={totals.reach} icon={Target} />
            <StatCard label="Likes" value={totals.likes} icon={Heart} />
            <StatCard label="Comments" value={totals.comments} icon={MessageSquare} />
            <StatCard label="Shares" value={totals.shares} icon={Share2} />
            <StatCard label="Saves" value={totals.saves} icon={Bookmark} />
          </div>

          {chartData.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">14-Day Trend</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Legend />
                  {filtered.map((d, i) => (
                    <Line key={d.platform} type="monotone" dataKey={`${d.platform}_imp`} name={`${PLATFORM_META[d.platform]?.abbr} impressions`}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {data.length === 0 && !loading && <p className="text-sm text-muted-foreground text-center py-8">No analytics data for this profile</p>}
    </div>
  );
}
