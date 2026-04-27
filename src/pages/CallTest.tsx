import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, RefreshCw, Phone, Bot, User, Voicemail, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type CallLog = {
  id: string;
  twilio_call_sid: string | null;
  twilio_status: string | null;
  amd_result: string | null;
  connected_to_vapi: boolean | null;
  disposition: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  meta: any;
  campaign_id: string;
};

type CampaignSettings = {
  ai_enabled?: boolean;
  human_transfer_phone?: string;
  vapi_assistant_id?: string;
};

export default function CallTest() {
  const [callSid, setCallSid] = useState("");
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<CallLog | null>(null);
  const [settings, setSettings] = useState<CampaignSettings | null>(null);
  const [recentLogs, setRecentLogs] = useState<CallLog[]>([]);

  const lookup = async (sid?: string) => {
    const target = (sid ?? callSid).trim();
    setLoading(true);
    try {
      let query = supabase
        .from("powerdial_call_logs")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (target) {
        query = query.eq("twilio_call_sid", target);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;

      if (!data) {
        toast.error(target ? `No call log found for SID ${target}` : "No recent calls found");
        setLog(null);
        setSettings(null);
        return;
      }

      setLog(data as CallLog);

      // Pull associated campaign settings
      const { data: camp } = await supabase
        .from("powerdial_campaigns")
        .select("settings")
        .eq("id", data.campaign_id)
        .maybeSingle();

      setSettings((camp?.settings || {}) as CampaignSettings);
      if (!sid) toast.success("Call log loaded");
    } catch (err: any) {
      toast.error(err.message || "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const loadRecent = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("powerdial_call_logs")
        .select("*")
        .not("twilio_call_sid", "is", null)
        .order("updated_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      setRecentLogs((data || []) as CallLog[]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const amdBadge = (amd: string | null) => {
    if (!amd) return <Badge variant="outline">—</Badge>;
    if (amd === "human") return <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30"><User className="h-3 w-3 mr-1" />HUMAN</Badge>;
    if (amd === "voicemail") return <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30"><Voicemail className="h-3 w-3 mr-1" />VOICEMAIL</Badge>;
    if (amd === "busy") return <Badge variant="destructive">BUSY</Badge>;
    if (amd === "cancelled_triple_dial") return <Badge variant="outline">CANCELLED (triple-dial)</Badge>;
    return <Badge variant="outline">{amd.toUpperCase()}</Badge>;
  };

  const transferTarget = log?.meta?.human_transfer_phone || (settings?.ai_enabled === false ? settings?.human_transfer_phone : null);
  const transferMethod = log?.meta?.transfer_method;
  const aiEnabled = log?.meta?.ai_enabled !== undefined ? log.meta.ai_enabled : settings?.ai_enabled !== false;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Phone className="h-6 w-6 text-purple-400" />
            PowerDial Call Test
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inspect the last webhook event for any Twilio Call SID — confirms AMD, AI on/off, and transfer target.
          </p>
        </div>

        <Card className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Twilio Call SID (e.g. CA071adb9a6b...) — leave blank for last call"
              value={callSid}
              onChange={(e) => setCallSid(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
              className="font-mono text-sm"
            />
            <Button onClick={() => lookup()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Lookup
            </Button>
            <Button variant="outline" onClick={loadRecent} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Recent
            </Button>
          </div>
        </Card>

        {log && (
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Webhook Event Details</h2>
              <Badge variant="outline" className="font-mono text-xs">
                {new Date(log.updated_at).toLocaleString()}
              </Badge>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <Field label="Call SID" value={log.twilio_call_sid} mono />
              <Field label="Phone" value={log.phone} mono />
              <Field label="Twilio Status" value={log.twilio_status} />
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">AMD Result</div>
                {amdBadge(log.amd_result)}
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">AI Mode</div>
                {aiEnabled ? (
                  <Badge className="bg-purple-500/15 text-purple-300 border-purple-500/30">
                    <Bot className="h-3 w-3 mr-1" />AI ENABLED
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                    <User className="h-3 w-3 mr-1" />AI DISABLED (live transfer)
                  </Badge>
                )}
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Connected to Vapi</div>
                {log.connected_to_vapi ? (
                  <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" />YES
                  </Badge>
                ) : (
                  <Badge variant="outline"><XCircle className="h-3 w-3 mr-1" />NO</Badge>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Transfer Outcome</div>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <Field label="Method" value={transferMethod || "—"} />
                <Field label="Target Number" value={transferTarget || "—"} mono />
                <Field label="Disposition" value={log.disposition} />
                <Field label="Twilio From" value={log.meta?.twilio_from} mono />
              </div>
              {log.meta?.transfer_error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                  ⚠️ Transfer error: {log.meta.transfer_error}
                </div>
              )}
              {log.disposition === "transferred_to_human" && (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm text-emerald-300">
                  ✅ Successfully bridged to human at {transferTarget}
                </div>
              )}
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw meta JSON</summary>
              <pre className="mt-2 p-3 bg-muted/30 rounded-lg overflow-auto font-mono text-[11px]">
                {JSON.stringify(log.meta, null, 2)}
              </pre>
            </details>
          </Card>
        )}

        {recentLogs.length > 0 && (
          <Card className="p-4">
            <h3 className="font-semibold mb-3 text-sm">Recent Calls (click to inspect)</h3>
            <div className="space-y-1">
              {recentLogs.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setCallSid(r.twilio_call_sid || "");
                    lookup(r.twilio_call_sid || undefined);
                  }}
                  className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-md hover:bg-muted/50 text-xs"
                >
                  <span className="font-mono truncate">{r.twilio_call_sid}</span>
                  <span className="text-muted-foreground">{r.phone}</span>
                  {amdBadge(r.amd_result)}
                  <span className="text-muted-foreground whitespace-nowrap">
                    {new Date(r.updated_at).toLocaleTimeString()}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className={mono ? "font-mono text-xs break-all" : "text-sm"}>{value || "—"}</div>
    </div>
  );
}
