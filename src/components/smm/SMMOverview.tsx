import { useEffect, useState } from 'react';
import { smmApi } from '@/lib/smm/store';
import type { ScheduledPost, WebhookEvent } from '@/lib/smm/types';
import { CalendarDays, Clock, AlertTriangle, CheckCircle, Bell, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

function KPICard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="glass-card p-4 flex items-center gap-4">
      <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function SMMOverview({ posts }: { posts: ScheduledPost[] }) {
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);

  useEffect(() => { smmApi.getWebhookEvents().then(setWebhooks); }, []);

  const today = new Date().toISOString().slice(0, 10);
  const scheduledToday = posts.filter(p => p.scheduled_date?.startsWith(today) && p.status === 'scheduled');
  const failed24h = posts.filter(p => p.status === 'failed' && new Date(p.created_at) > new Date(Date.now() - 86400000));
  const completed7d = posts.filter(p => p.status === 'completed' && new Date(p.created_at) > new Date(Date.now() - 604800000));
  const total7d = posts.filter(p => new Date(p.created_at) > new Date(Date.now() - 604800000));
  const successRate = total7d.length ? Math.round((completed7d.length / total7d.length) * 100) : 100;
  const queued = posts.filter(p => p.status === 'queued' || p.status === 'scheduled').sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));
  const recent = [...posts].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Scheduled Today" value={scheduledToday.length} icon={CalendarDays} color="bg-primary/10 text-primary" />
        <KPICard label="Queue Next Slot" value={queued.length > 0 ? format(new Date(queued[0].scheduled_date || Date.now()), 'h:mm a') : '—'} icon={Clock} color="bg-accent/20 text-accent-foreground" />
        <KPICard label="Failed (24h)" value={failed24h.length} icon={AlertTriangle} color="bg-destructive/10 text-destructive" />
        <KPICard label="Success Rate (7d)" value={`${successRate}%`} icon={CheckCircle} color="bg-emerald-500/10 text-emerald-500" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Today's Schedule */}
        <div className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Today's Schedule</h3>
          {scheduledToday.length === 0 ? <p className="text-xs text-muted-foreground py-4 text-center">Nothing scheduled today</p> : (
            <div className="space-y-2">
              {scheduledToday.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.platforms.join(', ')} · {p.scheduled_date ? format(new Date(p.scheduled_date), 'h:mm a') : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Queue Preview */}
        <div className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Queue Preview</h3>
          {queued.length === 0 ? <p className="text-xs text-muted-foreground py-4 text-center">Queue empty</p> : (
            <div className="space-y-2">
              {queued.slice(0, 10).map(p => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${p.status === 'queued' ? 'bg-amber-400' : 'bg-primary'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.profile_username} · {p.scheduled_date ? format(new Date(p.scheduled_date), 'MMM d, h:mm a') : 'queued'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="h-4 w-4" /> Notifications
          </h3>
          <div className="space-y-2">
            {webhooks.slice(0, 6).map(w => (
              <div key={w.id} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${w.read ? 'bg-muted/30' : 'bg-primary/5 border border-primary/20'}`}>
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${w.type === 'upload_failed' ? 'bg-destructive' : 'bg-emerald-500'}`} />
                <div>
                  <p className="text-foreground">{w.message}</p>
                  <p className="text-muted-foreground">{format(new Date(w.timestamp), 'MMM d, h:mm a')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent History */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Recent History</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left py-2 font-medium">Time</th>
                <th className="text-left py-2 font-medium">Profile</th>
                <th className="text-left py-2 font-medium">Title</th>
                <th className="text-left py-2 font-medium">Platforms</th>
                <th className="text-left py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(p => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 text-muted-foreground whitespace-nowrap">{format(new Date(p.created_at), 'MMM d, h:mm a')}</td>
                  <td className="py-2 font-medium">{p.profile_username}</td>
                  <td className="py-2 truncate max-w-[200px]">{p.title}</td>
                  <td className="py-2 text-muted-foreground">{p.platforms.join(', ')}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                      p.status === 'failed' ? 'bg-destructive/10 text-destructive' :
                      p.status === 'scheduled' ? 'bg-primary/10 text-primary' :
                      p.status === 'in_progress' ? 'bg-amber-400/10 text-amber-500' :
                      'bg-muted text-muted-foreground'
                    }`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
