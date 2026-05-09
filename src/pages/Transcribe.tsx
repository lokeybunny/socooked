import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Upload, FileAudio, Loader2, Users, Sparkles, Download, Copy, Check, Save, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

function last10(p: string): string {
  return (p || "").replace(/\D/g, "").slice(-10);
}

interface Segment {
  speaker: number;
  speaker_label: string;
  start: number;
  end: number;
  text: string;
  confidence: number;
}

interface Analysis {
  summary: string;
  conversation_type: string;
  voices: Array<{
    voice_label: string;
    identified_role: string;
    tone?: string;
    talk_share_estimate_pct?: number;
    key_points?: string[];
  }>;
  sentiment: string;
  key_topics: string[];
  action_items: string[];
  questions_asked?: string[];
  objections_or_concerns?: string[];
  next_steps?: string[];
  highlights?: string[];
  client_wants?: string[];
  chatgpt_prompt?: string;
}

interface Result {
  filename: string;
  duration_seconds: number | null;
  detected_language: string;
  voice_count: number;
  transcript: string;
  raw_transcript: string;
  segments: Segment[];
  analysis: Analysis | null;
}

const VOICE_COLORS = [
  "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "bg-purple-500/15 text-purple-300 border-purple-500/30",
  "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "bg-pink-500/15 text-pink-300 border-pink-500/30",
];

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function Transcribe() {
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedWants, setCopiedWants] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [savePhone, setSavePhone] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [contacts, setContacts] = useState<Array<{ phone_last10: string; name: string | null; phone: string | null }>>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Load saved transcript when ?id= is present
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from("contact_transcripts")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        if (error) toast({ title: "Could not load transcript", description: error.message, variant: "destructive" });
        return;
      }
      setResult({
        filename: data.filename || data.title || "Saved transcript",
        duration_seconds: data.duration_seconds,
        detected_language: (data.analysis as any)?.detected_language || "en",
        voice_count: data.voice_count || 0,
        transcript: data.transcript || "",
        raw_transcript: data.transcript || "",
        segments: ((data.analysis as any)?.segments) || [],
        analysis: (data.analysis as any) || {
          summary: data.summary || "",
          conversation_type: data.conversation_type || "",
          voices: [],
          sentiment: data.sentiment || "",
          key_topics: [],
          action_items: [],
          client_wants: data.client_wants || [],
          chatgpt_prompt: data.chatgpt_prompt || "",
        },
      });
      setSavePhone(data.phone_last10);
      setSaveTitle(data.title || "");
      if ((data as any).audio_url) setAudioUrl((data as any).audio_url);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    supabase
      .from("sms_contacts")
      .select("phone_last10, name, phone")
      .order("starred", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(500)
      .then(({ data }) => setContacts((data as any) || []));
  }, []);

  // Load emails-to-analyze payload pushed from the Email page
  useEffect(() => {
    if (searchParams.get("source") !== "emails") return;
    const raw = sessionStorage.getItem("transcribe_emails_payload");
    if (!raw) return;
    sessionStorage.removeItem("transcribe_emails_payload");
    let payload: any;
    try { payload = JSON.parse(raw); } catch { return; }
    if (!payload?.emails?.length) return;
    setLoading(true);
    setResult(null);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("email-analyze", { body: payload });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setResult(data as Result);
        setSaveTitle((data as any).filename || "Email thread analysis");
        toast({ title: "Email analysis complete", description: `Analyzed ${payload.emails.length} email(s)` });
      } catch (e: any) {
        toast({ title: "Analysis failed", description: e?.message || "Unknown error", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const filteredContacts = (() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return contacts.slice(0, 8);
    const digits = q.replace(/\D/g, "");
    return contacts
      .filter((c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (digits && c.phone_last10.includes(digits))
      )
      .slice(0, 8);
  })();

  const saveToCRM = async () => {
    const p10 = last10(savePhone);
    if (p10.length !== 10) {
      toast({ title: "Enter a valid 10-digit phone", variant: "destructive" });
      return;
    }
    if (!result) return;
    setSaving(true);
    try {
      await supabase.from("sms_contacts").upsert(
        { phone_last10: p10, phone: "+1" + p10, name: "" } as any,
        { onConflict: "phone_last10", ignoreDuplicates: true } as any,
      );

      // Upload audio to public storage so it can be replayed later
      let publicAudioUrl: string | null = null;
      if (audioFile) {
        const ext = (audioFile.name.split(".").pop() || "mp3").toLowerCase();
        const path = `transcripts/${p10}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const up = await supabase.storage.from("content-uploads").upload(path, audioFile, {
          contentType: audioFile.type || "audio/mpeg",
          upsert: false,
        });
        if (!up.error) {
          const { data: pub } = supabase.storage.from("content-uploads").getPublicUrl(path);
          publicAudioUrl = pub?.publicUrl || null;
        } else {
          console.warn("Audio upload failed:", up.error.message);
        }
      }

      const { error } = await supabase.from("contact_transcripts").insert({
        phone_last10: p10,
        title: saveTitle || result.filename,
        filename: result.filename,
        duration_seconds: result.duration_seconds,
        voice_count: result.voice_count,
        summary: result.analysis?.summary || null,
        conversation_type: result.analysis?.conversation_type || null,
        sentiment: result.analysis?.sentiment || null,
        client_wants: result.analysis?.client_wants || null,
        chatgpt_prompt: result.analysis?.chatgpt_prompt || null,
        transcript: result.transcript,
        analysis: result.analysis as any,
        audio_url: publicAudioUrl,
      } as any);
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast({ title: "Saved to CRM", description: `Tagged to (${p10.slice(0,3)}) ${p10.slice(3,6)}-${p10.slice(6)} — visible in SMS notes.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|wav|m4a|ogg|webm|flac)$/i)) {
      toast({ title: "Invalid file", description: "Please upload an audio file (MP3, WAV, M4A...)", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    setAudioFile(file);
    setAudioUrl(URL.createObjectURL(file));

    try {
      const fd = new FormData();
      fd.append("audio", file);
      const { data, error } = await supabase.functions.invoke("transcribe-analyze", { body: fd });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as Result);
      toast({ title: "Transcription complete", description: `${data.voice_count} voice(s) detected` });
    } catch (e: any) {
      console.error(e);
      toast({ title: "Transcription failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const downloadTxt = () => {
    if (!result) return;
    const lines = [
      `File: ${result.filename}`,
      `Duration: ${result.duration_seconds}s | Voices: ${result.voice_count} | Language: ${result.detected_language}`,
      "",
      "═══ TRANSCRIPT ═══",
      result.transcript,
    ];
    if (result.analysis) {
      lines.push("", "═══ ANALYSIS ═══", `Summary: ${result.analysis.summary}`, "");
      result.analysis.voices.forEach(v => lines.push(`${v.voice_label} → ${v.identified_role}${v.tone ? ` (${v.tone})` : ""}`));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${result.filename.replace(/\.[^.]+$/, "")}_transcript.txt`;
    a.click();
  };

  const copyTranscript = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Clipboard blocked", description: "Your browser blocked clipboard access. Try selecting and copying manually.", variant: "destructive" });
    }
  };

  return (
    <AppLayout>
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileAudio className="h-8 w-8 text-primary" />
          Transcribe
        </h1>
        <p className="text-muted-foreground mt-1">
          Drop an MP3 to transcribe with voice detection and full AI conversation analysis.
        </p>
      </div>

      {!result && (
        <Card
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed cursor-pointer transition-all p-12 text-center ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm,.flac"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg font-medium">Transcribing & analyzing...</p>
              <p className="text-sm text-muted-foreground">Voice detection + AI analysis in progress</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">Drop MP3 here or click to upload</p>
              <p className="text-sm text-muted-foreground">
                MP3, WAV, M4A, OGG, FLAC — voice detection + full AI analysis
              </p>
            </div>
          )}
        </Card>
      )}

      {result && (
        <>
          <Card className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <FileAudio className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">{result.filename}</p>
                  <div className="flex gap-2 mt-1">
                    {result.duration_seconds && <Badge variant="outline">{fmtTime(result.duration_seconds)}</Badge>}
                    <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" />{result.voice_count} voice{result.voice_count !== 1 ? "s" : ""}</Badge>
                    <Badge variant="outline">{result.detected_language}</Badge>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyTranscript}>
                  {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={downloadTxt}>
                  <Download className="h-4 w-4 mr-1" /> Download
                </Button>
                <Button size="sm" onClick={() => { setResult(null); setAudioUrl(null); }}>
                  New File
                </Button>
              </div>
            </div>
            {audioUrl && <audio controls src={audioUrl} className="w-full mt-3" />}
          </Card>

          <Card className="p-4 border-blue-500/40 bg-blue-500/5">
            <div className="flex items-center gap-2 mb-3">
              <UserPlus className="h-5 w-5 text-blue-400" />
              <h3 className="font-semibold">Save to CRM — tag to an SMS contact</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Save this analysis to a phone number. It will show up in the contact's notes inside the SMS thread, so you can reference past meetings any time.
            </p>
            <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
              <div className="relative">
                <Input
                  placeholder="Search contact name or phone…"
                  value={contactQuery || savePhone}
                  onChange={(e) => {
                    setContactQuery(e.target.value);
                    setSavePhone(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                />
                {showSuggestions && filteredContacts.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-popover shadow-lg">
                    {filteredContacts.map((c) => (
                      <button
                        key={c.phone_last10}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex justify-between gap-2"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSavePhone(c.phone_last10);
                          setContactQuery(c.name ? `${c.name} (${c.phone_last10})` : c.phone_last10);
                          setShowSuggestions(false);
                        }}
                      >
                        <span className="font-medium truncate">{c.name || "(no name)"}</span>
                        <span className="text-muted-foreground tabular-nums">
                          ({c.phone_last10.slice(0,3)}) {c.phone_last10.slice(3,6)}-{c.phone_last10.slice(6)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Input
                placeholder="Title (optional)"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
              />
              <Button onClick={saveToCRM} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : saved ? <Check className="h-4 w-4 mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                {saved ? "Saved" : "Save to CRM"}
              </Button>
            </div>
          </Card>

          <Tabs defaultValue="analysis">
            <TabsList>
              <TabsTrigger value="analysis"><Sparkles className="h-4 w-4 mr-1" />AI Analysis</TabsTrigger>
              <TabsTrigger value="transcript">Diarized Transcript</TabsTrigger>
              <TabsTrigger value="raw">Raw Text</TabsTrigger>
            </TabsList>

            <TabsContent value="analysis" className="space-y-4">
              {result.analysis ? (
                <>
                  <Card className="p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <Badge>{result.analysis.conversation_type}</Badge>
                        <Badge variant="outline" className="ml-2">Sentiment: {result.analysis.sentiment}</Badge>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed">{result.analysis.summary}</p>
                  </Card>

                  {result.analysis.client_wants && result.analysis.client_wants.length > 0 && (
                    <Card className="p-5 border-primary/40 bg-primary/5">
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-primary" />
                          What the Client Wants
                        </h3>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const text = result.analysis!.client_wants!.map((w) => `• ${w}`).join("\n");
                              await navigator.clipboard.writeText(text);
                              setCopiedWants(true);
                              setTimeout(() => setCopiedWants(false), 1500);
                              toast({ title: "Copied bullet list to clipboard" });
                            } catch {
                              toast({ title: "Clipboard blocked", description: "Your browser blocked clipboard access.", variant: "destructive" });
                            }
                          }}
                        >
                          {copiedWants ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                          Copy bullets
                        </Button>
                      </div>
                      <ul className="space-y-2 text-sm">
                        {result.analysis.client_wants.map((w, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            <span className="leading-relaxed">{w}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}

                  {result.analysis.chatgpt_prompt && (
                    <Card className="p-5 border-emerald-500/40 bg-emerald-500/5">
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <div>
                          <h3 className="font-semibold text-lg flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-emerald-500" />
                            ChatGPT Prompt — Real-time Video Edit Generator
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            Paste this into ChatGPT to generate concrete edit prompts from the client's vision.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(result.analysis!.chatgpt_prompt!);
                                setCopiedPrompt(true);
                                setTimeout(() => setCopiedPrompt(false), 1500);
                                toast({ title: "Copied prompt to clipboard" });
                              } catch {
                                toast({ title: "Clipboard blocked", description: "Your browser blocked clipboard access.", variant: "destructive" });
                              }
                            }}
                          >
                            {copiedPrompt ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                            Copy prompt
                          </Button>
                          <Button
                            size="sm"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(result.analysis!.chatgpt_prompt!);
                              } catch { /* ignore */ }
                              window.open("https://chat.openai.com/", "_blank");
                            }}
                          >
                            Open ChatGPT
                          </Button>
                        </div>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap font-mono bg-background/60 p-3 rounded-md border max-h-72 overflow-auto">
{result.analysis.chatgpt_prompt}
                      </pre>
                    </Card>
                  )}

                  <div className="grid md:grid-cols-2 gap-4">
                    {result.analysis.voices.map((v, i) => (
                      <Card key={i} className={`p-4 border ${VOICE_COLORS[i % VOICE_COLORS.length]}`}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold">{v.voice_label}</h3>
                          {v.talk_share_estimate_pct != null && (
                            <Badge variant="outline">{v.talk_share_estimate_pct}% talk</Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium">{v.identified_role}</p>
                        {v.tone && <p className="text-xs mt-1 opacity-80">Tone: {v.tone}</p>}
                        {v.key_points && v.key_points.length > 0 && (
                          <ul className="mt-2 text-xs space-y-1 list-disc list-inside">
                            {v.key_points.map((p, j) => <li key={j}>{p}</li>)}
                          </ul>
                        )}
                      </Card>
                    ))}
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {result.analysis.key_topics?.length > 0 && (
                      <Card className="p-4">
                        <h3 className="font-semibold mb-2">Key Topics</h3>
                        <div className="flex flex-wrap gap-1">
                          {result.analysis.key_topics.map((t, i) => <Badge key={i} variant="secondary">{t}</Badge>)}
                        </div>
                      </Card>
                    )}
                    {result.analysis.action_items?.length > 0 && (
                      <Card className="p-4">
                        <h3 className="font-semibold mb-2">Action Items</h3>
                        <ul className="text-sm space-y-1 list-disc list-inside">
                          {result.analysis.action_items.map((a, i) => <li key={i}>{a}</li>)}
                        </ul>
                      </Card>
                    )}
                    {result.analysis.questions_asked && result.analysis.questions_asked.length > 0 && (
                      <Card className="p-4">
                        <h3 className="font-semibold mb-2">Questions Asked</h3>
                        <ul className="text-sm space-y-1 list-disc list-inside">
                          {result.analysis.questions_asked.map((q, i) => <li key={i}>{q}</li>)}
                        </ul>
                      </Card>
                    )}
                    {result.analysis.objections_or_concerns && result.analysis.objections_or_concerns.length > 0 && (
                      <Card className="p-4">
                        <h3 className="font-semibold mb-2">Objections / Concerns</h3>
                        <ul className="text-sm space-y-1 list-disc list-inside">
                          {result.analysis.objections_or_concerns.map((o, i) => <li key={i}>{o}</li>)}
                        </ul>
                      </Card>
                    )}
                    {result.analysis.next_steps && result.analysis.next_steps.length > 0 && (
                      <Card className="p-4">
                        <h3 className="font-semibold mb-2">Next Steps</h3>
                        <ul className="text-sm space-y-1 list-disc list-inside">
                          {result.analysis.next_steps.map((n, i) => <li key={i}>{n}</li>)}
                        </ul>
                      </Card>
                    )}
                    {result.analysis.highlights && result.analysis.highlights.length > 0 && (
                      <Card className="p-4">
                        <h3 className="font-semibold mb-2">Highlights</h3>
                        <ul className="text-sm space-y-1 list-disc list-inside">
                          {result.analysis.highlights.map((h, i) => <li key={i}>"{h}"</li>)}
                        </ul>
                      </Card>
                    )}
                  </div>
                </>
              ) : (
                <Card className="p-6 text-center text-muted-foreground">No analysis available</Card>
              )}
            </TabsContent>

            <TabsContent value="transcript">
              <Card className="p-4">
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-3">
                    {result.segments.length > 0 ? result.segments.map((s, i) => (
                      <div key={i} className={`p-3 rounded-lg border ${VOICE_COLORS[s.speaker % VOICE_COLORS.length]}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">{s.speaker_label}</span>
                          <span className="text-xs opacity-70">{fmtTime(s.start)} – {fmtTime(s.end)}</span>
                        </div>
                        <p className="text-sm">{s.text}</p>
                      </div>
                    )) : (
                      <p className="text-sm whitespace-pre-wrap">{result.transcript}</p>
                    )}
                  </div>
                </ScrollArea>
              </Card>
            </TabsContent>

            <TabsContent value="raw">
              <Card className="p-4">
                <ScrollArea className="h-[500px] pr-4">
                  <p className="text-sm whitespace-pre-wrap">{result.raw_transcript}</p>
                </ScrollArea>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
    </AppLayout>
  );
}
