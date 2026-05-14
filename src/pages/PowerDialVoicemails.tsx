// Pre-AI Interlude manager.
//
// This page used to manage VMD voicemail drops as well — that whole power-dialer
// flow has been retired. The only purpose now: show the recording that plays
// to inbound callers right BEFORE Twilio bridges them to the Vapi AI assistant,
// and let the operator swap it for a new upload.
//
// The selected recording's id is stored in app_settings.inbound_interlude_recording_id
// and consumed by supabase/functions/twilio-dial-complete/index.ts.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, RefreshCw, ArrowLeft, CheckCircle2, Trash2, Mic } from "lucide-react";

const TARGET_SAMPLE_RATE = 8000;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type Recording = {
  id: string;
  name: string;
  original_filename: string | null;
  original_format: string | null;
  original_size: number | null;
  storage_path: string;
  public_url: string;
  mime_type: string;
  sample_rate: number;
  channels: number;
  codec: string;
  duration_sec: number | null;
  file_size: number | null;
  created_at: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

async function decodeAndResample(file: File): Promise<{ samples: Float32Array; durationSec: number }> {
  const arrayBuf = await file.arrayBuffer();
  const tmpCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  let decoded: AudioBuffer;
  try {
    decoded = await tmpCtx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    tmpCtx.close();
  }
  const durationSec = decoded.duration;
  const targetLen = Math.ceil(durationSec * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, targetLen, TARGET_SAMPLE_RATE);
  const src = offline.createBufferSource();
  let monoBuf: AudioBuffer;
  if (decoded.numberOfChannels === 1) {
    monoBuf = decoded;
  } else {
    monoBuf = offline.createBuffer(1, decoded.length, decoded.sampleRate);
    const out = monoBuf.getChannelData(0);
    const channels: Float32Array[] = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
    for (let i = 0; i < decoded.length; i++) {
      let sum = 0;
      for (let c = 0; c < channels.length; c++) sum += channels[c][i];
      out[i] = sum / channels.length;
    }
  }
  src.buffer = monoBuf;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  const raw = rendered.getChannelData(0).slice();

  let peak = 0;
  for (let i = 0; i < raw.length; i++) {
    const v = Math.abs(raw[i]);
    if (v > peak) peak = v;
  }
  if (peak > 0) {
    const target = 0.707;
    const gain = Math.min(target / peak, 4);
    if (Math.abs(gain - 1) > 0.01) {
      for (let i = 0; i < raw.length; i++) {
        let s = raw[i] * gain;
        if (s > 0.95) s = 0.95;
        else if (s < -0.95) s = -0.95;
        raw[i] = s;
      }
    }
  }

  return { samples: raw, durationSec };
}

export default function PowerDialVoicemails() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [interludeId, setInterludeId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const [{ data, error }, { data: setting }] = await Promise.all([
      supabase
        .from("voicemail_recordings")
        .select("id,name,original_filename,original_format,original_size,storage_path,public_url,mime_type,sample_rate,channels,codec,duration_sec,file_size,created_at")
        .order("created_at", { ascending: false }),
      supabase.from("app_settings").select("value").eq("key", "inbound_interlude_recording_id").maybeSingle(),
    ]);
    if (error) toast.error(error.message);
    else setRecordings((data as Recording[]) || []);
    setInterludeId(((setting?.value as any)?.recording_id as string) || null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function setAsInterlude(id: string, name: string) {
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: "inbound_interlude_recording_id", value: { recording_id: id } },
        { onConflict: "key" },
      );
    if (error) toast.error(error.message);
    else {
      setInterludeId(id);
      toast.success(`"${name}" is now the pre-AI interlude`);
    }
  }

  async function handleUpload(file: File) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File must be under 20 MB");
      return;
    }
    setUploading(true);
    const t = toast.loading(`Decoding ${file.name}…`);
    try {
      const { samples, durationSec } = await decodeAndResample(file);
      if (durationSec > 60) {
        toast.error("Recording must be 60 seconds or less", { id: t });
        setUploading(false);
        return;
      }
      toast.loading(`Uploading & transcoding (${durationSec.toFixed(1)}s)…`, { id: t });
      const pcmBytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
      const pcm_base64 = bytesToBase64(pcmBytes);

      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess.session?.access_token;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/powerdial-voicemail-transcode`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          name: uploadName || file.name,
          original_filename: file.name,
          original_format: file.type || "unknown",
          original_size: file.size,
          duration_sec: durationSec,
          pcm_base64,
          codec: "pcm_mulaw",
          set_active: false,
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.ok) throw new Error(json?.error || `HTTP ${resp.status}`);
      toast.success(`Uploaded → ${json.recording.codec} / ${json.recording.sample_rate}Hz`, { id: t });

      // Auto-promote the freshly uploaded clip to the live interlude.
      const newId = json?.recording?.id as string | undefined;
      if (newId) {
        await setAsInterlude(newId, json.recording.name || file.name);
      }

      setUploadName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message || e}`, { id: t });
    } finally {
      setUploading(false);
    }
  }

  async function remove(rec: Recording) {
    if (rec.id === interludeId) {
      toast.error("Pick a different interlude before deleting this one.");
      return;
    }
    if (!confirm(`Delete "${rec.name}"?`)) return;
    await supabase.storage.from("content-uploads").remove([rec.storage_path]);
    const { error } = await supabase.from("voicemail_recordings").delete().eq("id", rec.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      load();
    }
  }

  const current = recordings.find((r) => r.id === interludeId) || null;
  const others = recordings.filter((r) => r.id !== interludeId);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/phone" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Phone
            </Link>
            <h1 className="text-3xl font-bold">Pre-AI Interlude</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              The short message callers hear right before Twilio bridges them to the AI assistant.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* Currently active interlude */}
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="w-5 h-5 text-primary" /> Currently Playing
              <Badge>LIVE</Badge>
            </CardTitle>
            <CardDescription>
              {current
                ? `"${current.name}" — ${current.duration_sec?.toFixed(1) ?? "?"}s · ${current.codec} / ${current.sample_rate}Hz`
                : "Built-in default clip (vvm-incoming) — exactly what callers hear today before the AI picks up. Upload a new file below to replace it."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <audio
              controls
              src={
                current
                  ? current.public_url
                  : `${SUPABASE_URL}/functions/v1/powerdial-voicemail-audio?file=vvm-incoming`
              }
              className="w-full"
            />
          </CardContent>
        </Card>

        {/* Upload (auto-activates) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" /> Replace with New Recording
            </CardTitle>
            <CardDescription>
              Upload an MP3, WAV, M4A, WEBM, AAC or OGG (≤ 60s). It's auto-converted to Twilio-safe audio
              and instantly set as the live interlude.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Recording name (optional)</Label>
              <Input
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g. Warren – Nov 2025 greeting"
              />
            </div>
            <Input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            {uploading && <p className="text-xs text-muted-foreground">Working… do not refresh.</p>}
          </CardContent>
        </Card>

        {/* Past uploads — quick swap */}
        {others.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Previously Uploaded</CardTitle>
              <CardDescription>Click "Use" to swap the live interlude back to an older clip.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {others.map((rec) => (
                <div key={rec.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{rec.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {rec.duration_sec?.toFixed(1) ?? "?"}s · uploaded {new Date(rec.created_at).toLocaleDateString()}
                    </div>
                    <audio controls src={rec.public_url} className="w-full mt-2 h-8" />
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button size="sm" onClick={() => setAsInterlude(rec.id, rec.name)}>
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Use
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => remove(rec)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
