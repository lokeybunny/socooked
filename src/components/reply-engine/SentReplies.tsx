import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-green-500/20 text-green-400 border-green-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

export default function SentReplies() {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSent = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reply-engine?action=sent`,
      {
        headers: {
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      }
    );
    const data = await res.json();
    setAttempts(data.attempts || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSent(); }, [fetchSent]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Sent Replies</h2>
        <Button variant="outline" size="sm" onClick={fetchSent} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Original Post</th>
              <th className="px-4 py-3 font-medium">Reply Preview</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Error</th>
              <th className="px-4 py-3 font-medium">Sent At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {attempts.map((a) => {
              const post = a.reply_reviews?.reply_engine_posts;
              const account = a.outbound_accounts;
              return (
                <tr key={a.id} className="hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">
                    @{account?.account_identifier || "—"}
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="text-xs text-foreground truncate">
                      {post?.text_content?.substring(0, 60) || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="text-xs text-foreground truncate">
                      {a.reply_reviews?.edited_reply?.substring(0, 60) || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`text-xs ${STATUS_COLORS[a.status] || ""}`}>
                      {a.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="text-xs text-red-400 truncate">{a.error_message || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(a.attempted_at).toLocaleString()}
                  </td>
                </tr>
              );
            })}
            {attempts.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No sent replies yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
