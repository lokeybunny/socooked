import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, KeyRound, Play, Trash2 } from "lucide-react";

type Status = {
  source_channel_id: string;
  token_source: "db_override" | "env" | "missing";
  token_valid: boolean;
  token_updated_at: string | null;
  bot: { id: string; username: string } | null;
  poll_state: { channel_id: string; last_message_id: string; updated_at: string } | null;
};

const invoke = async (action: string, extra: Record<string, unknown> = {}) => {
  const { data, error } = await supabase.functions.invoke("xitbot-admin", {
    body: { action, ...extra },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
};

export default function XitbotAdmin() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [newToken, setNewToken] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await invoke("status");
      setStatus(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleRotate = async () => {
    if (!newToken.trim()) return toast.error("Paste a token first");
    setBusy("rotate");
    try {
      const data = await invoke("rotate", { token: newToken.trim() });
      toast.success(`Token rotated → ${data.bot?.username}`);
      setNewToken("");
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleTestPoll = async () => {
    setBusy("test");
    try {
      const data = await invoke("test_poll");
      if (data.ok) toast.success("Poll OK: " + data.body);
      else toast.error(`Poll failed (${data.status}): ${data.body}`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleClear = async () => {
    if (!confirm("Clear DB override and fall back to env XITBOT_TOKEN?")) return;
    setBusy("clear");
    try {
      await invoke("clear_override");
      toast.success("Override cleared");
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">XITBOT Admin</h1>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Poll Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {loading && !status ? (
              <div className="flex items-center text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
              </div>
            ) : status ? (
              <>
                <Row label="Source channel" value={<code>{status.source_channel_id}</code>} />
                <Row
                  label="Token source"
                  value={
                    <Badge variant={status.token_source === "missing" ? "destructive" : "secondary"}>
                      {status.token_source}
                    </Badge>
                  }
                />
                <Row
                  label="Token valid"
                  value={
                    <Badge variant={status.token_valid ? "default" : "destructive"}>
                      {status.token_valid ? "Yes" : "No"}
                    </Badge>
                  }
                />
                <Row label="Bot" value={status.bot ? `${status.bot.username} (${status.bot.id})` : "—"} />
                <Row
                  label="Token rotated at"
                  value={status.token_updated_at ? new Date(status.token_updated_at).toLocaleString() : "—"}
                />
                <Row
                  label="Last message id"
                  value={status.poll_state?.last_message_id ? <code>{status.poll_state.last_message_id}</code> : "—"}
                />
                <Row
                  label="Last poll update"
                  value={
                    status.poll_state?.updated_at ? new Date(status.poll_state.updated_at).toLocaleString() : "—"
                  }
                />
              </>
            ) : null}
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={handleTestPoll} disabled={busy !== null}>
                {busy === "test" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Run poll now
              </Button>
              {status?.token_source === "db_override" && (
                <Button size="sm" variant="outline" onClick={handleClear} disabled={busy !== null}>
                  {busy === "clear" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Clear override
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <KeyRound className="h-4 w-4 mr-2" /> Rotate XITBOT_TOKEN
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste a fresh bot token from Discord Developer Portal → XITBOT → Bot → Reset Token. We validate it
              against Discord before saving. The poller will pick it up on the next run.
            </p>
            <Input
              type="password"
              placeholder="Paste new bot token…"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              autoComplete="off"
            />
            <Button onClick={handleRotate} disabled={busy !== null || !newToken.trim()}>
              {busy === "rotate" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4 mr-2" />
              )}
              Validate & save
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
