import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Loader2, Sparkles, FlaskConical, Rocket, ExternalLink, CheckCircle2 } from "lucide-react";

const EXAMPLE_DATA = {
  user_request: "Build a website for a black barbershop owned by a kid named Terrion. Booking-focused. Modern and fun.",
  business_name: "Terrion's Cuts",
  cta: "Book Appointment",
  style_tags: "high-tech, creative, minimal, fun",
  niche: "",
  notes: "",
  must_include_pages: "",
};

interface V0DesignerResult {
  success: boolean;
  data?: {
    chat_id: string;
    preview_url: string | null;
    edit_url: string;
    thread_id: string;
    status: string;
    is_edit: boolean;
  };
  error?: string;
}

export default function PromptMachine() {
  const [userRequest, setUserRequest] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [niche, setNiche] = useState("");
  const [cta, setCta] = useState("");
  const [styleTags, setStyleTags] = useState("");
  const [notes, setNotes] = useState("");
  const [mustIncludePages, setMustIncludePages] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [meta, setMeta] = useState<{ model: string; generated_at: string } | null>(null);
  const [v0Result, setV0Result] = useState<V0DesignerResult | null>(null);

  const loadExample = () => {
    setUserRequest(EXAMPLE_DATA.user_request);
    setBusinessName(EXAMPLE_DATA.business_name);
    setCta(EXAMPLE_DATA.cta);
    setStyleTags(EXAMPLE_DATA.style_tags);
    setNiche(EXAMPLE_DATA.niche);
    setNotes(EXAMPLE_DATA.notes);
    setMustIncludePages(EXAMPLE_DATA.must_include_pages);
    toast.success("Example loaded");
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = { user_request: userRequest };
    if (businessName) payload.business_name = businessName;
    if (niche) payload.niche = niche;
    if (cta) payload.cta = cta;
    if (notes) payload.notes = notes;
    if (styleTags) payload.style_tags = styleTags.split(",").map((s) => s.trim()).filter(Boolean);
    if (mustIncludePages) payload.must_include_pages = mustIncludePages.split(",").map((s) => s.trim()).filter(Boolean);
    return payload;
  };

  const generate = async (autoSubmit = false) => {
    if (!userRequest.trim()) {
      toast.error("Enter a user request");
      return;
    }

    if (autoSubmit) {
      setSubmitting(true);
    } else {
      setLoading(true);
    }
    setResult("");
    setMeta(null);
    setV0Result(null);

    try {
      const payload = buildPayload();
      if (autoSubmit) payload.auto_submit = true;

      const { data, error } = await supabase.functions.invoke("prompt-machine", {
        body: payload,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Generation failed");

      setResult(data.data.v0_prompt);
      setMeta(data.meta);

      if (data.data.v0_designer) {
        setV0Result(data.data.v0_designer);
        if (data.data.v0_designer.success) {
          toast.success("Prompt generated & submitted to V0!");
        } else {
          toast.error(`V0 submission failed: ${data.data.v0_designer.error}`);
        }
      } else {
        toast.success("V0 prompt generated!");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg);
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(result);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Internal Prompting Machine
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Generate optimized V0 prompts for website builds
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadExample} className="gap-2">
          <FlaskConical className="h-4 w-4" />
          Load Example
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Request Input</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">User Request *</label>
              <Textarea
                placeholder="Describe the website you want built..."
                value={userRequest}
                onChange={(e) => setUserRequest(e.target.value)}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Business Name</label>
                <Input placeholder="e.g. Terrion's Cuts" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Niche</label>
                <Input placeholder="e.g. barbershop" value={niche} onChange={(e) => setNiche(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">CTA</label>
                <Input placeholder="e.g. Book Now" value={cta} onChange={(e) => setCta(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Style Tags</label>
                <Input placeholder="high-tech, creative, minimal" value={styleTags} onChange={(e) => setStyleTags(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Must Include Pages</label>
              <Input placeholder="Home, About, Contact" value={mustIncludePages} onChange={(e) => setMustIncludePages(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Notes</label>
              <Textarea placeholder="Any extra instructions..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={() => generate(false)} disabled={loading || submitting} variant="outline" className="w-full gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? "Generating..." : "Generate Only"}
              </Button>
              <Button onClick={() => generate(true)} disabled={loading || submitting} className="w-full gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {submitting ? "Submitting to V0..." : "Generate & Submit"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Output Panel */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">V0 Prompt Output</CardTitle>
            {result && (
              <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-2">
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* V0 Designer Result */}
            {v0Result?.success && v0Result.data && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-primary font-medium text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  Submitted to V0 — {v0Result.data.status}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {v0Result.data.preview_url && (
                    <a href={v0Result.data.preview_url} target="_blank" rel="noopener noreferrer">
                      <Badge variant="secondary" className="cursor-pointer gap-1">
                        <ExternalLink className="h-3 w-3" /> Preview
                      </Badge>
                    </a>
                  )}
                  {v0Result.data.edit_url && (
                    <a href={v0Result.data.edit_url} target="_blank" rel="noopener noreferrer">
                      <Badge variant="outline" className="cursor-pointer gap-1">
                        <ExternalLink className="h-3 w-3" /> Edit in V0
                      </Badge>
                    </a>
                  )}
                  <Badge variant="outline">Chat: {v0Result.data.chat_id?.substring(0, 8)}...</Badge>
                </div>
              </div>
            )}

            {v0Result && !v0Result.success && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                V0 submission error: {v0Result.error}
              </div>
            )}

            {meta && (
              <div className="flex gap-2">
                <Badge variant="secondary">{meta.model}</Badge>
                <Badge variant="outline">{new Date(meta.generated_at).toLocaleTimeString()}</Badge>
              </div>
            )}
            {result ? (
              <pre className="bg-muted p-4 rounded-lg text-sm text-foreground whitespace-pre-wrap max-h-[500px] overflow-y-auto font-mono leading-relaxed">
                {result}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                {loading || submitting ? (submitting ? "Generating prompt & submitting to V0..." : "Generating prompt via OpenRouter...") : "Output will appear here"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
