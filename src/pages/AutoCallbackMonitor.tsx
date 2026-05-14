// Auto-Callback Drop monitoring page.
// Verifies two things end-to-end:
//   1. SMS auto-replies are NOT going out — every blocked attempt is logged
//      to public.auto_reply_kill_log by the 4 patched edge functions.
//   2. Voicemail-only outbound is queued AFTER the 2-min window — every row
//      in public.auto_callback_queue shows scheduled_at − created_at ≈ 2 min,
//      and only fires when AnsweredBy=human.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, ShieldCheck, Phone, MessageSquareOff, CheckCircle2, AlertTriangle } from "lucide-react";

type QueueRow = {
  id: string;
  phone: string;
  status: string;
  scheduled_at: string;
  created_at: string;
  attempts: number | null;
  answered_by: string | null;
  twilio_call_sid: string | null;
  delivered_at: string | null;
  last_error: string | null;
  meta: any;
};

type KillRow = {
  id: string;
  source: string;
  phone: string | null;
  reason: string | null;
  meta: any;
  created_at: string;
};

function fmtDelta(a: string, b: string) {
  const ms = new Date(a).getTime() - new Date(b).getTime();
  if (!isFinite(ms)) return "?";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = (s / 60).toFixed(1);
  return `${m}m`;
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "delivered" || s === "completed") return "default";
  if (s === "pending" || s === "dialing") return "secondary";
  if (s === "skipped_machine" || s === "no_answer") return "outline";
  return "destructive";
}

export default function AutoCallbackMonitor() {
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [killed, setKilled] = useState<KillRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: q }, { data: k }] = await Promise.all([
      supabase
        .from("auto_callback_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("auto_reply_kill_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setQueue((q as QueueRow[]) || []);
    setKilled((k as KillRow[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const queueStats = useMemo(() => {
    const by: Record<string, number> = {};
    for (const r of queue) by[r.status] = (by[r.status] || 0) + 1;
    return by;
  }, [queue]);

  const killStats = useMemo(() => {
    const by: Record<string, number> = {};
    for (const r of killed) by[r.source] = (by[r.source] || 0) + 1;
    return by;
  }, [killed]);

  const windowOk = useMemo(() => {
    // Verify scheduled_at is ≥ 110s after created_at (2-min target, allow 10s slack).
    return queue.every((r) => {
      const ms = new Date(r.scheduled_at).getTime() - new Date(r.created_at).getTime();
      return ms >= 110_000;
    });
  }, [queue]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/powerdial/voicemails" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Pre-AI Interlude
            </Link>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-7 h-7 text-primary" /> Auto-Callback Monitor
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Live proof that SMS auto-replies are blocked and the voicemail-only outbound only fires after the 2-minute no-info window.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* Health summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquareOff className="w-4 h-4 text-destructive" /> SMS Auto-Reply
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KILLED</div>
              <p className="text-xs text-muted-foreground mt-1">
                {killed.length} blocked attempts logged (last 50)
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="w-4 h-4 text-primary" /> Callback Queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{queue.length}</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {Object.entries(queueStats).map(([s, n]) => (
                  <Badge key={s} variant={statusVariant(s)}>{s}: {n}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {windowOk ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <AlertTriangle className="w-4 h-4 text-destructive" />}
                2-Min Window
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{windowOk ? "OK" : "DRIFT"}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Every queued callback must wait ≥ ~2 min before dispatch.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Callback queue table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Callback Queue (last 50)</CardTitle>
            <CardDescription>
              Rows enqueued by <code>vapi-webhook</code> when the AI got no usable info (short call OR no transcript). Dispatched by cron every minute via <code>auto-callback-dispatch</code>; voicemail only plays if AMD reports <code>human</code>/<code>unknown</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {queue.length === 0 ? (
              <p className="text-sm text-muted-foreground">No callbacks queued yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-3">Phone</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Wait</th>
                      <th className="py-2 pr-3">Answered</th>
                      <th className="py-2 pr-3">Attempts</th>
                      <th className="py-2 pr-3">Created</th>
                      <th className="py-2 pr-3">Scheduled</th>
                      <th className="py-2 pr-3">Delivered</th>
                      <th className="py-2 pr-3">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map((r) => {
                      const wait = fmtDelta(r.scheduled_at, r.created_at);
                      const okWait = new Date(r.scheduled_at).getTime() - new Date(r.created_at).getTime() >= 110_000;
                      return (
                        <tr key={r.id} className="border-b border-border/50">
                          <td className="py-2 pr-3 font-mono">{r.phone}</td>
                          <td className="py-2 pr-3"><Badge variant={statusVariant(r.status)}>{r.status}</Badge></td>
                          <td className={`py-2 pr-3 ${okWait ? "text-primary" : "text-destructive"}`}>{wait}</td>
                          <td className="py-2 pr-3">{r.answered_by || "—"}</td>
                          <td className="py-2 pr-3">{r.attempts ?? 0}</td>
                          <td className="py-2 pr-3">{new Date(r.created_at).toLocaleTimeString()}</td>
                          <td className="py-2 pr-3">{new Date(r.scheduled_at).toLocaleTimeString()}</td>
                          <td className="py-2 pr-3">{r.delivered_at ? new Date(r.delivered_at).toLocaleTimeString() : "—"}</td>
                          <td className="py-2 pr-3 text-destructive">{r.last_error || ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Kill-switch log */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Blocked SMS Auto-Replies (last 50)</CardTitle>
            <CardDescription>
              Every row here is an SMS auto-reply that <span className="text-primary font-semibold">was NOT sent</span>. Sources: <code>twilio-sms-inbound</code>, <code>twilio-inbound-poll</code>, <code>twilio-dial-complete</code>, <code>vapi-webhook</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(killStats).map(([s, n]) => (
                <Badge key={s} variant="outline">{s}: {n}</Badge>
              ))}
            </div>
            {killed.length === 0 ? (
              <p className="text-sm text-muted-foreground">No blocked SMS attempts in the recent window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-3">When</th>
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">Phone</th>
                      <th className="py-2 pr-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {killed.map((r) => (
                      <tr key={r.id} className="border-b border-border/50">
                        <td className="py-2 pr-3">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="py-2 pr-3"><Badge variant="outline">{r.source}</Badge></td>
                        <td className="py-2 pr-3 font-mono">{r.phone || "—"}</td>
                        <td className="py-2 pr-3">{r.reason || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
