import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RefreshCw, Sparkles, Eye } from "lucide-react";
import { toast } from "sonner";
import ReplyDetailModal from "./ReplyDetailModal";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  suggestions_ready: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  needs_review: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  approved: "bg-green-500/20 text-green-400 border-green-500/30",
  replied: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function ReplyQueue() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<any>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("reply_engine_posts")
      .select("*, reply_reviews(*), reply_suggestions(*)")
      .order("created_at", { ascending: false })
      .limit(100);
    setPosts((data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const generateReplies = async (postId: string) => {
    setGenerating(postId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reply-engine?action=generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ post_id: postId }),
        }
      );
      const result = await res.json();
      if (result.ok) {
        toast.success("Reply suggestions generated");
        fetchQueue();
      } else {
        toast.error(result.error || "Generation failed");
      }
    } catch (e) {
      toast.error("Failed to generate replies");
    }
    setGenerating(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Reply Queue</h2>
        <Button variant="outline" size="sm" onClick={fetchQueue} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Author</th>
              <th className="px-4 py-3 font-medium">Post Preview</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {posts.map((post) => (
              <tr key={post.id} className="hover:bg-muted/10 transition-colors">
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-xs">{post.platform}</Badge>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">
                  @{post.author_handle || "unknown"}
                </td>
                <td className="px-4 py-3 max-w-[300px]">
                  <p className="text-foreground truncate text-xs">{post.text_content?.substring(0, 80) || "—"}</p>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{post.category || "—"}</td>
                <td className="px-4 py-3 text-xs font-mono">{post.score || 0}</td>
                <td className="px-4 py-3">
                  <Badge className={`text-xs ${STATUS_COLORS[post.status] || ""}`}>
                    {post.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(post.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {(!post.reply_suggestions || post.reply_suggestions.length === 0) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => generateReplies(post.id)}
                        disabled={generating === post.id}
                      >
                        <Sparkles className={`h-3 w-3 mr-1 ${generating === post.id ? "animate-spin" : ""}`} />
                        Generate
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setSelectedPost(post)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {posts.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  No posts in queue. Posts will appear here when ingested.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedPost && (
        <ReplyDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onRefresh={fetchQueue}
        />
      )}
    </div>
  );
}
