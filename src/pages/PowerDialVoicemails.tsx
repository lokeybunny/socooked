import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Upload,
  Play,
  Phone,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";

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
  is_active: boolean;
  tts_fallback_text: string | null;
  pause_before_sec: number;
  pause_after_sec: number;
  last_test_call_sid: string | null;
  last_test_played_at: string | null;
  last_fetch_status: any;
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

// Decode any browser-supported audio file → mono Float32 @ 8kHz via OfflineAudioContext.
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
  // Mix down to mono manually if needed.
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

  // Normalize so the recording matches the loudness profile of the working
  // voicemail-guru file. μ-law over Twilio sounds like static if the input is
  // either too hot (clipping) or too quiet (encoder noise floor dominates).
  // Target peak: -3 dBFS (~0.707), with a hard ceiling at 0.95.
  let peak = 0;
  for (let i = 0; i < raw.length; i++) {
    const v = Math.abs(raw[i]);
    if (v > peak) peak = v;
  }
  if (peak > 0) {
    const target = 0.707;
    const gain = Math.min(target / peak, 4); // cap gain so silent files don't get amplified to noise
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
  const [setActiveOnUpload, setSetActiveOnUpload] = useState(true);
  // Locked to μ-law: this matches the working voicemail-guru file
  // (WAV / pcm_mulaw / 8000Hz / mono) — the only format Twilio plays cleanly.
  const codec = "pcm_mulaw" as const;
  const [testPhone, setTestPhone] = useState("+14244658105");
  const [interludeId, setInterludeId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const [{ data, error }, { data: setting }] = await Promise.all([
      supabase.from("voicemail_recordings").select("*").order("created_at", { ascending: false }),
      supabase.from("app_settings").select("value").eq("key", "inbound_interlude_recording_id").maybeSingle(),
    ]);
    if (error) toast.error(error.message);
    else setRecordings((data as Recording[]) || []);
    setInterludeId(((setting?.value as any)?.recording_id as string) || null);
    setLoading(false);
  }

  async function setAsInterlude(rec: Recording) {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "inbound_interlude_recording_id", value: { recording_id: rec.id } }, { onConflict: "key" });
    if (error) toast.error(error.message);
    else {
      setInterludeId(rec.id);
      toast.success(`"${rec.name}" is now the pre-AI interlude`);
    }
  }

  async function clearInterlude() {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "inbound_interlude_recording_id", value: { recording_id: null } }, { onConflict: "key" });
    if (error) toast.error(error.message);
    else {
      setInterludeId(null);
      toast.success("Reverted to default interlude");
    }
  }

  useEffect(() => {
    load();
  }, []);

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
          codec,
          set_active: setActiveOnUpload,
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.ok) throw new Error(json?.error || `HTTP ${resp.status}`);
      toast.success(`Transcoded → ${json.recording.codec} / ${json.recording.sample_rate}Hz / mono`, { id: t });
      setUploadName("");
      if (fileInputRef.current) fileInputRef.current.value = "";

      // ── Post-upload validation ─────────────────────────────────────
      // Verify exactly ONE active recording exists, and that it is the one
      // we just uploaded. Warn loudly if not — a missing/wrong active
      // recording is the #1 cause of "voicemail drop is playing the old
      // file" or "no voicemail at all".
      try {
        const newId = json?.recording?.id;
        const { data: actives } = await supabase
          .from("voicemail_recordings")
          .select("id, name, is_active")
          .eq("is_active", true);
        const count = actives?.length ?? 0;
        if (count === 0) {
          toast.error(
            "⚠️ No active voicemail recording! VMD will fall back to default. Click 'Set Active' on the recording you want to use.",
            { duration: 10_000 },
          );
        } else if (count > 1) {
          toast.error(
            `⚠️ ${count} recordings are marked ACTIVE — only one should be. VMD picks one at random. Deactivate the extras.`,
            { duration: 10_000 },
          );
        } else if (setActiveOnUpload && newId && actives![0].id !== newId) {
          toast.error(
            `⚠️ Upload finished but "${actives![0].name}" is still active — your new recording is NOT being dropped. Click 'Set Active' on it.`,
            { duration: 10_000 },
          );
        } else if (!setActiveOnUpload) {
          toast.warning(
            "Heads up: upload was NOT set active. The previous recording is still being dropped. Click 'Set Active' on this one when ready.",
            { duration: 8_000 },
          );
        }
      } catch (validateErr) {
        console.warn("[voicemail upload] post-validate failed", validateErr);
      }

      await load();
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message || e}`, { id: t });
    } finally {
      setUploading(false);
    }
  }

  async function setActive(id: string) {
    await supabase.from("voicemail_recordings").update({ is_active: false }).eq("is_active", true);
    const { error } = await supabase.from("voicemail_recordings").update({ is_active: true }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Active recording updated");
      load();
    }
  }

  async function remove(rec: Recording) {
    if (!confirm(`Delete "${rec.name}"?`)) return;
    await supabase.storage.from("content-uploads").remove([rec.storage_path]);
    const { error } = await supabase.from("voicemail_recordings").delete().eq("id", rec.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      load();
    }
  }

  async function testFileUrl(rec: Recording) {
    const t = toast.loading("Probing public URL…");
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/powerdial-voicemail-audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_url", url: rec.public_url }),
      });
      const json = await resp.json();
      await supabase.from("voicemail_recordings").update({ last_fetch_status: json }).eq("id", rec.id);
      if (json.ok) {
        toast.success(`OK — ${json.content_type} (${json.bytes} bytes)`, { id: t });
      } else {
        toast.error(`Failed — ${(json.hints || []).join("; ") || json.error}`, { id: t });
      }
      load();
    } catch (e: any) {
      toast.error(e.message || String(e), { id: t });
    }
  }

  async function testCall(rec: Recording, useTts = false) {
    if (!testPhone) {
      toast.error("Enter a phone number");
      return;
    }
    const t = toast.loading(`Calling ${testPhone}…`);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess.session?.access_token;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/powerdial-voicemail-test-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ recording_id: rec.id, to_phone: testPhone, use_tts_fallback: useTts }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.ok) throw new Error(json?.error || `HTTP ${resp.status}`);
      toast.success(`Call placed — SID ${json.call_sid?.slice(0, 10)}…`, { id: t });
      load();
    } catch (e: any) {
      toast.error(`Test call failed: ${e.message || e}`, { id: t });
    }
  }

  async function updatePauses(rec: Recording, before: number, after: number) {
    const { error } = await supabase
      .from("voicemail_recordings")
      .update({ pause_before_sec: before, pause_after_sec: after })
      .eq("id", rec.id);
    if (error) toast.error(error.message);
    else load();
  }

  async function updateTtsFallback(rec: Recording, text: string) {
    const { error } = await supabase
      .from("voicemail_recordings")
      .update({ tts_fallback_text: text })
      .eq("id", rec.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Fallback text saved");
      load();
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/powerdial" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to VMD
            </Link>
            <h1 className="text-3xl font-bold">Voicemail Drops</h1>
            <p className="text-muted-foreground mt-1">
              Upload audio → transcoded to Twilio-safe WAV (μ-law, 8kHz, mono) → hosted with correct Content-Type.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="py-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-500 flex-shrink-0" />
            <div>
              <strong>TCPA &amp; compliance:</strong> Voicemail drops and automated outreach are subject to TCPA, state mini-TCPA laws, and carrier rules.
              Honour STOP/opt-outs and only contact numbers you have lawful basis to reach.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" /> Upload new recording
            </CardTitle>
            <CardDescription>
              Accepts MP3, WAV, M4A, WEBM, AAC, OGG. Max 60 seconds. Decoded in your browser, then re-encoded server-side.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Recording name</Label>
              <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="e.g. Warren default voicemail" />
              <p className="text-xs text-muted-foreground mt-2">
                Auto-converted to Twilio-safe WAV (μ-law / 8kHz / mono) and loudness-normalized to match the working drop — no static.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={setActiveOnUpload} onCheckedChange={setSetActiveOnUpload} />
              <Label>Set as active recording after upload</Label>
            </div>
            <div>
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" /> Test target phone
            </CardTitle>
            <CardDescription>Used for "Test call" buttons — calls your own number to preview playback.</CardDescription>
          </CardHeader>
          <CardContent>
            <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+14244658105" />
          </CardContent>
        </Card>

        <div className="space-y-3">
          {recordings.length === 0 && !loading && (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No recordings yet. Upload one above.</CardContent></Card>
          )}
          {recordings.map((rec) => (
            <Card key={rec.id} className={rec.is_active ? "border-primary/50" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {rec.name}
                      {rec.is_active && <Badge>ACTIVE</Badge>}
                    </CardTitle>
                    <CardDescription className="mt-1 space-x-2 text-xs">
                      <span>{rec.codec}</span>
                      <span>·</span>
                      <span>{rec.sample_rate} Hz</span>
                      <span>·</span>
                      <span>{rec.channels} ch</span>
                      <span>·</span>
                      <span>{rec.duration_sec?.toFixed(1) ?? "?"} s</span>
                      <span>·</span>
                      <span>{rec.file_size ? `${(rec.file_size / 1024).toFixed(1)} KB` : "?"}</span>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {!rec.is_active && (
                      <Button size="sm" variant="outline" onClick={() => setActive(rec.id)}>Set active</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => remove(rec)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <audio controls src={rec.public_url} className="w-full" />

                <div className="grid md:grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div>
                    <strong>Original:</strong> {rec.original_filename} ({rec.original_format}, {rec.original_size ? `${(rec.original_size / 1024).toFixed(1)} KB` : "?"})
                  </div>
                  <div>
                    <strong>MIME:</strong> {rec.mime_type}
                  </div>
                  <div className="truncate">
                    <strong>URL:</strong> <a href={rec.public_url} className="text-primary hover:underline" target="_blank" rel="noreferrer">{rec.public_url}</a>
                  </div>
                  <div>
                    <strong>Last test SID:</strong> {rec.last_test_call_sid?.slice(0, 14) || "—"}
                  </div>
                  {rec.last_fetch_status && (
                    <div className="md:col-span-2 flex items-start gap-2 p-2 rounded bg-muted/30">
                      {rec.last_fetch_status.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5" />
                      )}
                      <pre className="text-[10px] overflow-auto flex-1">{JSON.stringify(rec.last_fetch_status, null, 2)}</pre>
                    </div>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Pause before (s)</Label>
                    <Input
                      type="number" min={0} max={10} defaultValue={rec.pause_before_sec}
                      onBlur={(e) => updatePauses(rec, Number(e.target.value), rec.pause_after_sec)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Pause after (s)</Label>
                    <Input
                      type="number" min={0} max={10} defaultValue={rec.pause_after_sec}
                      onBlur={(e) => updatePauses(rec, rec.pause_before_sec, Number(e.target.value))}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">TTS fallback text (used if audio playback fails)</Label>
                  <Textarea
                    defaultValue={rec.tts_fallback_text || ""}
                    placeholder="Hi, this is Warren — I missed you, please call me back at 702-701-6192."
                    onBlur={(e) => updateTtsFallback(rec, e.target.value)}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => testFileUrl(rec)}>
                    <Play className="w-4 h-4 mr-1" /> Test File URL
                  </Button>
                  <Button size="sm" onClick={() => testCall(rec, false)}>
                    <Phone className="w-4 h-4 mr-1" /> Test voicemail audio (call me)
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => testCall(rec, true)}>
                    <Phone className="w-4 h-4 mr-1" /> Test TTS fallback (call me)
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
