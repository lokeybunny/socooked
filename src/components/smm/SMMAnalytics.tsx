import { useEffect, useState } from 'react';
import type { SMMProfile, AnalyticsData, Platform } from '@/lib/smm/types';
import { smmApi } from '@/lib/smm/store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Users, Eye, Target, Heart, MessageSquare, Share2, Bookmark } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <div className="glass-card p-4 flex items-center gap-3">
      <Icon className="h-5 w-5 text-primary shrink-0" />
      <div>
        <p className="text-lg font-bold text-foreground">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function SMMAnalytics({ profiles }: { profiles: SMMProfile[] }) {
  const [profileId, setProfileId] = useState(profiles[0]?.id || '');
  const [data, setData] = useState<AnalyticsData[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    setLoading(true);
    smmApi.getAnalytics(profileId).then(d => { setData(d); setLoading(false); });
  }, [profileId]);

  const filtered = selectedPlatform === 'all' ? data : data.filter(d => d.platform === selectedPlatform);
  const totals = filtered.reduce((acc, d) => ({
    followers: acc.followers + d.followers, impressions: acc.impressions + d.impressions,
    reach: acc.reach + d.reach, likes: acc.likes + d.likes, comments: acc.comments + d.comments,
    shares: acc.shares + d.shares, saves: acc.saves + d.saves,
  }), { followers: 0, impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0 });

  // Merge series for chart
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
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Profile</Label>
          <Select value={profileId} onValueChange={setProfileId}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.username}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Platform</Label>
          <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {platforms.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

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
                <Line key={d.platform} type="monotone" dataKey={`${d.platform}_imp`} name={`${d.platform} impressions`}
                  stroke={['hsl(var(--primary))', '#f59e0b', '#ef4444', '#06b6d4'][i % 4]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.length === 0 && !loading && <p className="text-sm text-muted-foreground text-center py-8">No analytics data for this profile</p>}
    </div>
  );
}
