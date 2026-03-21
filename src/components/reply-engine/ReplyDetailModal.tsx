import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Send, Copy, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Props {
  post: any;
  onClose: () => void;
  onRefresh: () => void;
}

export default function ReplyDetailModal({ post, onClose, onRefresh }: Props) {
  const [suggestions, setSuggestions] = useState<any[]>(post.reply_suggestions || []);
  const [review, setReview] = useState<any>(post.reply_reviews?.[0] || null);
  const [editedReply, setEditedReply] = useState(review?.edited_reply || "");
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(review?.selected_reply_suggestion_id || null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    supabase.from("outbound_accounts").select("*").eq("is_authorized", true)
      .then(({ data }) => {
        setAccounts((data as any[]) || []);
        if (data?.length) setSelectedAccount(data[0].id);
      });
  }, []);

  const apiCall = async (action: string, body: any) => {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reply-engine?action=${action}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(body),
      }
    );
    return res.json();
  };

  const selectSuggestion = (s: any) => {
    setSelectedSuggestion(s.id);
    setEditedReply(s.suggested_reply);
  };

  const saveEdit = async () => {
    if (!review?.id) return;
    await apiCall("save-edit", {
      review_id: review.id,
      edited_reply: editedReply,
      selected_suggestion_id: selectedSuggestion,
    });
    toast.success("Edit saved");
  };

  const handleApprove = async () => {
    if (!review?.id) return;
    // Auto-save before approving
    await apiCall("save-edit", {
      review_id: review.id,
      edited_reply: editedReply,
      selected_suggestion_id: selectedSuggestion,
    });
    const result = await apiCall("approve", { review_id: review.id });
    if (result.ok) {
      toast.success("Reply approved");
      setReview({ ...review, status: "approved" });
      onRefresh();
    }
  };

  const handleReject = async () => {
    if (!review?.id) return;
    const result = await apiCall("reject", { review_id: review.id });
    if (result.ok) {
      toast.success("Reply rejected");
      onClose();
      onRefresh();
    }
  };

  const handleSend = async () => {
    if (!review?.id || !selectedAccount) return;
    setSending(true);
    const result = await apiCall("send", {
      review_id: review.id,
      account_id: selectedAccount,
    });
    setSending(false);
    if (result.ok) {
      toast.success("Reply sent successfully!");
      onClose();
      onRefresh();
    } else {
      toast.error(result.error || "Send failed");
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    const result = await apiCall("generate", { post_id: post.id });
    if (result.ok) {
      setSuggestions(result.suggestions || []);
      toast.success("Suggestions generated");
      onRefresh();
    }
    setGenerating(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(editedReply);
    toast.success("Copied to clipboard");
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Reply Detail</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Original Post */}
          <div className="rounded-lg border border-border p-4 bg-muted/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{post.platform}</Badge>
                <span className="text-sm font-mono text-foreground">@{post.author_handle || "unknown"}</span>
              </div>
              {post.post_url && (
                <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> View Original
                </a>
              )}
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{post.text_content || "No content"}</p>
            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              {post.category && <span>Category: {post.category}</span>}
              {post.niche && <span>Niche: {post.niche}</span>}
              <span>Score: {post.score || 0}</span>
            </div>
          </div>

          {/* AI Reply Suggestions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">AI Reply Suggestions</h3>
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
                <Sparkles className={`h-3 w-3 mr-1 ${generating ? "animate-spin" : ""}`} />
                {suggestions.length ? "Regenerate" : "Generate"}
              </Button>
            </div>

            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suggestions yet. Click Generate to create reply options.</p>
            ) : (
              <div className="grid gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => selectSuggestion(s)}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      selectedSuggestion === s.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs capitalize">{s.variant_name}</Badge>
                      <span className="text-xs text-muted-foreground">{s.tone}</span>
                    </div>
                    <p className="text-sm text-foreground">{s.suggested_reply}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Editable Reply */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Your Reply</h3>
            <Textarea
              value={editedReply}
              onChange={(e) => setEditedReply(e.target.value)}
              placeholder="Select a suggestion above or write your own reply..."
              className="min-h-[100px] bg-background"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">{editedReply.length} chars</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyToClipboard} disabled={!editedReply}>
                  <Copy className="h-3 w-3 mr-1" /> Copy
                </Button>
                <Button variant="outline" size="sm" onClick={saveEdit} disabled={!editedReply}>
                  Save Edit
                </Button>
              </div>
            </div>
          </div>

          {/* Review Actions */}
          {review && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">Status:</span>
                <Badge className="text-xs">{review.status}</Badge>
              </div>

              <div className="flex gap-2">
                {review.status === "needs_review" && (
                  <>
                    <Button onClick={handleApprove} disabled={!editedReply} className="bg-green-600 hover:bg-green-700">
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button variant="destructive" onClick={handleReject}>
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </>
                )}

                {review.status === "approved" && (
                  <div className="flex items-center gap-2 w-full">
                    <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                      <SelectTrigger className="w-[240px]">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            @{a.account_identifier} ({a.provider})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleSend} disabled={sending || !selectedAccount}>
                      <Send className={`h-4 w-4 mr-1 ${sending ? "animate-spin" : ""}`} />
                      {sending ? "Sending..." : "Send Reply"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
