import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  reply_generated: "bg-blue-500/20 text-blue-400",
  reply_edited: "bg-yellow-500/20 text-yellow-400",
  reply_approved: "bg-green-500/20 text-green-400",
  reply_rejected: "bg-red-500/20 text-red-400",
  send_success: "bg-emerald-500/20 text-emerald-400",
  send_failed: "bg-red-500/20 text-red-400",
  settings_updated: "bg-purple-500/20 text-purple-400",
};

export default function ReplyAuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reply-engine?action=audit-logs`,
      {
        headers: {
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      }
    );
    const data = await res.json();
    setLogs(data.logs || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Audit Logs</h2>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">Details</th>
              <th className="px-4 py-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-muted/10 transition-colors">
                <td className="px-4 py-3">
                  <Badge className={`text-xs ${ACTION_COLORS[log.action] || "bg-muted"}`}>
                    {log.action}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-foreground">
                  {log.entity_type}/{log.entity_id?.substring(0, 8) || "—"}
                </td>
                <td className="px-4 py-3 max-w-[300px]">
                  <p className="text-xs text-muted-foreground truncate">
                    {JSON.stringify(log.metadata || {}).substring(0, 100)}
                  </p>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {logs.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                  No audit logs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
