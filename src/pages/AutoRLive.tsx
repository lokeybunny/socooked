import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, StopCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type Job = {
  job_id: string;
  source_url: string;
  recording_name: string | null;
  status: string;
  stop_phrase: string | null;
  browserbase_session_id: string | null;
  browserbase_live_view_url: string | null;
  browserbase_recording_url: string | null;
  video_url: string | null;
  token_name: string | null;
  start_time: string | null;
};

export default function AutoRLive() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase.from("recording_jobs").select("*").eq("job_id", jobId).maybeSingle();
      if (active && data) setJob(data as Job);
      setLoading(false);
    };
    load();
    const channel = supabase
      .channel(`autor-live-${jobId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "recording_jobs", filter: `job_id=eq.${jobId}` },
        (payload) => setJob(payload.new as Job))
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [jobId]);

  const launch = async () => {
    if (!jobId) return;
    setLaunching(true);
    const { data, error } = await supabase.functions.invoke("autor-browserbase-launch", { body: { jobId } });
    setLaunching(false);
    if (error || (data as any)?.error) toast.error((data as any)?.error || error?.message || "Launch failed");
    else toast.success("Cloud browser launched");
  };

  const stop = async () => {
    if (!jobId) return;
    setStopping(true);
    const { data, error } = await supabase.functions.invoke("autor-browserbase-launch", { body: { jobId, action: "stop" } });
    setStopping(false);
    if (error || (data as any)?.error) toast.error((data as any)?.error || error?.message || "Stop failed");
    else toast.success("Recording stopped");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!job) return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground">Job not found</p></div>;

  const isLive = job.status === "recording" && !!job.browserbase_live_view_url;
  const isCompleted = job.status === "completed";
  const canLaunch = ["queued", "failed"].includes(job.status);

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Card className="p-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold truncate">{job.recording_name || "AutoR Live"}</h1>
              <Badge variant={isLive ? "default" : isCompleted ? "secondary" : "outline"}>{job.status}</Badge>
              {job.token_name && <Badge variant="outline">{job.token_name}</Badge>}
            </div>
            <a href={job.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 truncate max-w-[60vw]">
              {job.source_url} <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
          <div className="flex items-center gap-2">
            {canLaunch && (
              <Button onClick={launch} disabled={launching}>
                {launching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Launch Cloud Browser
              </Button>
            )}
            {isLive && (
              <Button variant="destructive" onClick={stop} disabled={stopping}>
                {stopping ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <StopCircle className="h-4 w-4 mr-2" />}
                Stop & Save
              </Button>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden rounded-3xl bg-black aspect-video">
          {isLive && job.browserbase_live_view_url ? (
            <iframe
              src={job.browserbase_live_view_url}
              title="AutoR Live Browser"
              className="w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts"
              allow="clipboard-read; clipboard-write"
            />
          ) : isCompleted && (job.browserbase_recording_url || job.video_url) ? (
            <video src={job.browserbase_recording_url || job.video_url || ""} controls className="w-full h-full" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Loader2 className="h-10 w-10 animate-spin" />
              <p className="text-sm">{job.status === "launching_browser" ? "Launching cloud browser…" : `Status: ${job.status}`}</p>
              {canLaunch && <p className="text-xs">Click "Launch Cloud Browser" above to start.</p>}
            </div>
          )}
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Stop phrase: <span className="text-foreground">{job.stop_phrase || "—"}</span> · Anyone with this link can watch live.
        </p>
      </div>
    </div>
  );
}
