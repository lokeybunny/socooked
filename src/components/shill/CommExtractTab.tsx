import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Download, Copy, Loader2, BadgeCheck, Users, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Member {
  handle: string;
  name: string;
  verified: boolean;
  followers: number;
  bio: string;
  role: string;
}

export default function CommExtractTab() {
  const [communityUrl, setCommunityUrl] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollResults = useCallback(async (rid: string, vOnly: boolean) => {
    try {
      const { data, error } = await supabase.functions.invoke("comm-extract", {
        body: { action: "poll", runId: rid, verifiedOnly: vOnly },
      });
      if (error) throw error;

      if (data.members) setMembers(data.members);
      setStatusText(`${data.status} — ${data.total || 0} members found`);

      if (data.done) {
        setStatus("done");
        stopPolling();
        toast.success(`Scrape complete — ${data.total} members extracted`);
      } else if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(data.status)) {
        setStatus("error");
        stopPolling();
        toast.error(`Scrape ${data.status.toLowerCase()}`);
      }
    } catch (e: any) {
      console.error("Poll error:", e);
    }
  }, []);

  const startScrape = async () => {
    if (!communityUrl.trim()) {
      toast.error("Enter a community URL");
      return;
    }
    setStatus("running");
    setMembers([]);
    setStatusText("Starting scraper...");
    stopPolling();

    try {
      const { data, error } = await supabase.functions.invoke("comm-extract", {
        body: { action: "start", communityUrl: communityUrl.trim() },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to start");

      const rid = data.runId;
      setRunId(rid);
      setStatusText("Scraper started — polling for results...");

      // Poll every 5 seconds
      pollRef.current = setInterval(() => pollResults(rid, verifiedOnly), 5000);
      // Also poll immediately after a short delay
      setTimeout(() => pollResults(rid, verifiedOnly), 3000);
    } catch (e: any) {
      setStatus("error");
      setStatusText(e.message);
      toast.error("Failed to start: " + e.message);
    }
  };

  const copyHandles = () => {
    const handles = members.map(m => `@${m.handle}`).join("\n");
    navigator.clipboard.writeText(handles);
    toast.success(`${members.length} handles copied`);
  };

  const downloadCsv = () => {
    const rows = [["handle", "name", "verified", "followers", "bio"]];
    members.forEach(m => rows.push([`@${m.handle}`, m.name, String(m.verified), String(m.followers), m.bio.replace(/"/g, '""')]));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comm-members-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  };

  const displayMembers = verifiedOnly ? members.filter(m => m.verified) : members;

  return (
    <div className="space-y-4 mt-4">
      {/* Input Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Community Member Extractor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://x.com/i/communities/1234567890..."
              value={communityUrl}
              onChange={(e) => setCommunityUrl(e.target.value)}
              className="text-sm flex-1"
            />
            <Button
              onClick={startScrape}
              disabled={status === "running"}
              size="sm"
            >
              {status === "running" ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Scraping...</>
              ) : (
                <><Search className="h-4 w-4 mr-1" /> Extract</>
              )}
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={verifiedOnly} onCheckedChange={setVerifiedOnly} />
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <BadgeCheck className="h-3.5 w-3.5 text-[#1d9bf0]" /> Verified only
              </span>
            </div>
            {statusText && (
              <Badge variant={status === "error" ? "destructive" : status === "done" ? "default" : "secondary"} className="text-[10px]">
                {status === "running" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {status === "done" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                {statusText}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {displayMembers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                {displayMembers.length} Members
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyHandles} className="text-xs">
                  <Copy className="h-3 w-3 mr-1" /> Copy @handles
                </Button>
                <Button size="sm" variant="outline" onClick={downloadCsv} className="text-xs">
                  <Download className="h-3 w-3 mr-1" /> CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-[180px]">Handle</TableHead>
                    <TableHead className="text-xs w-[140px]">Name</TableHead>
                    <TableHead className="text-xs w-[90px]">Role</TableHead>
                    <TableHead className="text-xs w-[80px] text-right">Followers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayMembers.map((m) => (
                    <TableRow key={m.handle}>
                      <TableCell className="text-xs font-mono">
                        <a
                          href={`https://x.com/${m.handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          @{m.handle}
                          {m.verified && <BadgeCheck className="h-3 w-3 text-[#1d9bf0]" />}
                        </a>
                      </TableCell>
                      <TableCell className="text-xs">{m.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.role}</TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        {m.followers >= 1000 ? `${(m.followers / 1000).toFixed(1)}K` : m.followers}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
