import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Loader2, Gift } from "lucide-react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function Vanities() {
  const [vanity, setVanity] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setCopied(false);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/vanity-claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
        },
      });

      const data = await res.json();

      if (res.status === 429) {
        setCooldown(true);
        toast.error(data.message);
        setTimeout(() => setCooldown(false), 30_000);
        return;
      }

      if (res.status === 410) {
        toast.error(data.message);
        return;
      }

      if (!res.ok) {
        toast.error(data.message || "Something went wrong");
        return;
      }

      setVanity(data.vanity);
      setRemaining(data.remaining ?? null);
      if (data.remaining === 0) {
        setCooldown(true);
        setTimeout(() => {
          setCooldown(false);
          setRemaining(null);
        }, 5 * 60 * 1000);
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const copyToClipboard = useCallback(() => {
    if (!vanity) return;
    navigator.clipboard.writeText(vanity);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }, [vanity]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <a
        href="https://warren.guru"
        className="absolute top-6 left-6 text-xs tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Home
      </a>
      <div className="w-full max-w-md space-y-8 text-center">
        {/* Header */}
        <div className="space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Gift className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Vanity Generator
          </h1>
          <p className="text-muted-foreground text-sm">
            Generate a unique vanity. Limited to 3 per 5 minutes.
          </p>
        </div>

        {/* Result */}
        {vanity && (
          <div className="relative group">
            <div className="bg-muted/50 border border-border rounded-xl p-5 font-mono text-base text-foreground break-all select-all">
              {vanity}
            </div>
            <button
              onClick={copyToClipboard}
              className="absolute top-3 right-3 p-2 rounded-lg bg-background/80 border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent"
              aria-label="Copy vanity"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>
        )}

        {/* Generate button */}
        <Button
          onClick={generate}
          disabled={loading || cooldown}
          size="lg"
          className="w-full h-12 text-base"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating…
            </>
          ) : cooldown ? (
            "Please wait…"
          ) : (
            "Generate Vanity"
          )}
        </Button>

        {/* Remaining indicator */}
        {remaining !== null && !cooldown && (
          <p className="text-xs text-muted-foreground">
            {remaining} generation{remaining !== 1 ? "s" : ""} remaining in this window
          </p>
        )}
        {cooldown && (
          <p className="text-xs text-muted-foreground">
            Rate limit reached. Please wait ~5 minutes before generating again.
          </p>
        )}
      </div>
    </div>
  );
}
