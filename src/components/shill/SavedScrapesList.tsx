import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Archive, Pencil, Trash2, Check, X, Users } from "lucide-react";
import { toast } from "sonner";
import type { SavedScrape } from "./CommExtractTab";

interface Props {
  scrapes: SavedScrape[];
  onLoad: (scrape: SavedScrape) => void;
  onRefresh: () => void;
}

export default function SavedScrapesList({ scrapes, onLoad, onRefresh }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const startRename = (s: SavedScrape) => {
    setEditingId(s.id);
    setEditName(s.name);
  };

  const saveRename = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase
      .from("comm_scrapes")
      .update({ name: editName.trim(), updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) {
      toast.error("Rename failed");
    } else {
      toast.success("Renamed");
      onRefresh();
    }
    setEditingId(null);
  };

  const deleteScrape = async (id: string) => {
    const { error } = await supabase.from("comm_scrapes").delete().eq("id", id);
    if (error) toast.error("Delete failed");
    else {
      toast.success("Scrape deleted");
      onRefresh();
    }
  };

  if (scrapes.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Archive className="h-4 w-4 text-primary" />
          Saved Communities ({scrapes.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {scrapes.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
          >
            {editingId === s.id ? (
              <div className="flex items-center gap-1 flex-1">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-6 text-xs flex-1"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && saveRename(s.id)}
                />
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveRename(s.id)}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => onLoad(s)}
                  className="flex items-center gap-2 text-left flex-1 min-w-0"
                >
                  <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{s.name}</span>
                  <span className="text-muted-foreground shrink-0">
                    {s.member_count} members
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </button>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startRename(s)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteScrape(s.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
