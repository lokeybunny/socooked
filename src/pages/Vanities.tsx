import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Loader2, Gift, ShieldCheck, Brain, MousePointer, Clock, Lock, Fingerprint } from "lucide-react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// ── Proof-of-Work: find a string where SHA-256(nonce + solution) starts with N zeros ──
async function solvePoW(nonce: string, difficulty: number): Promise<string> {
  let i = 0;
  while (true) {
    const candidate = `${i}`;
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-256", encoder.encode(nonce + candidate));
    const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
    if (hex.startsWith("0".repeat(difficulty))) return candidate;
    i++;
    if (i % 5000 === 0) await new Promise(r => setTimeout(r, 0));
  }
}

function solveCaptcha(a: number, b: number, op: string): number {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "×") return a * b;
  return a + b;
}

interface Challenge {
  nonce: string;
  captcha: { a: number; b: number; op: string };
  pow_difficulty: number;
  issued: number;
  sig: string;
}

export default function Vanities() {
  const [vanity, setVanity] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(false);

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [captchaInput, setCaptchaInput] = useState("");
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [powStatus, setPowStatus] = useState<"idle" | "solving" | "solved">("idle");
  const [powSolution, setPowSolution] = useState<string | null>(null);
  const [mouseMovements, setMouseMovements] = useState(0);
  const [keystrokes, setKeystrokes] = useState(0);
  const [pageLoadTime] = useState(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);

  const REQUIRED_MOUSE = 10;
  const REQUIRED_KEYS = 3;
  const REQUIRED_DWELL = 5;

  // Track mouse movements
  useEffect(() => {
    const handler = () => setMouseMovements(m => m + 1);
    const el = containerRef.current;
    if (el) {
      el.addEventListener("mousemove", handler);
      el.addEventListener("touchmove", handler);
    }
    return () => {
      if (el) {
        el.removeEventListener("mousemove", handler);
        el.removeEventListener("touchmove", handler);
      }
    };
  }, []);

  // Track keystrokes
  useEffect(() => {
    const handler = () => setKeystrokes(k => k + 1);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const fetchChallenge = useCallback(async () => {
    setLoadingChallenge(true);
    setPowStatus("idle");
    setPowSolution(null);
    setCaptchaInput("");
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/vanity-claim`, {
        method: "GET",
        headers: { apikey: SUPABASE_KEY },
      });
      const data = await res.json();
      setChallenge(data);

      setPowStatus("solving");
      const solution = await solvePoW(data.nonce, data.pow_difficulty);
      setPowSolution(solution);
      setPowStatus("solved");
    } catch {
      toast.error("Failed to load challenge. Please refresh.");
    } finally {
      setLoadingChallenge(false);
    }
  }, []);

  useEffect(() => { fetchChallenge(); }, [fetchChallenge]);

  const dwellMs = Date.now() - pageLoadTime;
  const hasEnoughMouse = mouseMovements >= REQUIRED_MOUSE;
  const hasEnoughKeys = keystrokes >= REQUIRED_KEYS;
  const hasEnoughDwell = dwellMs >= REQUIRED_DWELL * 1000;
  const captchaCorrect = challenge ? Number(captchaInput) === solveCaptcha(challenge.captcha.a, challenge.captcha.b, challenge.captcha.op) : false;
  const allChecksPass = challenge && captchaCorrect && powStatus === "solved" && hasEnoughMouse && hasEnoughDwell && hasEnoughKeys;

  const generate = useCallback(async () => {
    if (!challenge || !powSolution) return;
    setLoading(true);
    setCopied(false);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/vanity-claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
        body: JSON.stringify({
          nonce: challenge.nonce,
          captcha_answer: Number(captchaInput),
          captcha_a: challenge.captcha.a,
          captcha_b: challenge.captcha.b,
          captcha_op: challenge.captcha.op,
          pow_solution: powSolution,
          honeypot: "",
          dwell_ms: Date.now() - pageLoadTime,
          issued: challenge.issued,
          sig: challenge.sig,
          mouse_movements: mouseMovements,
          user_agent_hash: navigator.userAgent.length,
        }),
      });

      const data = await res.json();

      if (res.status === 429) {
        setCooldown(true);
        toast.error(data.message);
        setTimeout(() => setCooldown(false), 60_000);
        return;
      }
      if (res.status === 410) { toast.error(data.message); return; }
      if (!res.ok) { toast.error(data.message || "Something went wrong"); return; }

      setVanity(data.vanity);
      setRemaining(data.remaining ?? null);
      if (data.remaining === 0) {
        setCooldown(true);
        setTimeout(() => { setCooldown(false); setRemaining(null); }, 10 * 60 * 1000);
      }
      fetchChallenge();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [challenge, captchaInput, powSolution, pageLoadTime, fetchChallenge, mouseMovements]);

  const copyToClipboard = useCallback(() => {
    if (!vanity) return;
    navigator.clipboard.writeText(vanity);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }, [vanity]);

  const opLabel = challenge?.captcha.op === "×" ? "×" : challenge?.captcha.op || "+";

  return (
    <div ref={containerRef} className="min-h-screen bg-background flex items-center justify-center p-4">
      <a
        href="https://warren.guru"
        className="absolute top-6 left-6 text-xs tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Home
      </a>
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Gift className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Vanity Generator</h1>
          <p className="text-muted-foreground text-sm">Complete all 6 security checks below to generate.</p>
        </div>

        {vanity && (
          <div className="relative group">
            <div className="bg-muted/50 border border-border rounded-xl p-5 font-mono text-base text-foreground break-all select-all">
              {vanity}
            </div>
            <button
              onClick={copyToClipboard}
              className="absolute top-3 right-3 p-2 rounded-lg bg-background/80 border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
        )}

        <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-4 text-left">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Security Verification (6 checks)
          </div>

          {/* 1. Math CAPTCHA */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Brain className="w-3.5 h-3.5" />
              <span>CAPTCHA — Solve the math problem</span>
              {captchaCorrect && <Check className="w-3.5 h-3.5 text-green-500 ml-auto" />}
            </div>
            {challenge ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-foreground bg-muted px-3 py-1.5 rounded-lg border border-border">
                  {challenge.captcha.a} {opLabel} {challenge.captcha.b} = ?
                </span>
                <Input
                  type="number"
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  className="w-24 h-9 text-center font-mono"
                  placeholder="?"
                />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Loading challenge…</div>
            )}
          </div>

          {/* 2. Proof of Work */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="w-3.5 h-3.5" />
            <span>Proof of Work — Heavy computation…</span>
            {powStatus === "solved" ? (
              <Check className="w-3.5 h-3.5 text-green-500 ml-auto" />
            ) : powStatus === "solving" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary ml-auto" />
            ) : null}
          </div>

          {/* 3. Mouse Movement */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MousePointer className="w-3.5 h-3.5" />
            <span>Mouse Activity ({Math.min(mouseMovements, REQUIRED_MOUSE)}/{REQUIRED_MOUSE})</span>
            {hasEnoughMouse && <Check className="w-3.5 h-3.5 text-green-500 ml-auto" />}
          </div>

          {/* 4. Keystroke check */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Fingerprint className="w-3.5 h-3.5" />
            <span>Keystroke Activity ({Math.min(keystrokes, REQUIRED_KEYS)}/{REQUIRED_KEYS})</span>
            {hasEnoughKeys && <Check className="w-3.5 h-3.5 text-green-500 ml-auto" />}
          </div>

          {/* 5. Dwell Time */}
          <DwellTimer pageLoadTime={pageLoadTime} required={REQUIRED_DWELL} />

          {/* 6. Honeypot (hidden) */}
          <input type="text" name="website_url" tabIndex={-1} autoComplete="off"
            style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0 }} />
        </div>

        <Button
          onClick={generate}
          disabled={loading || cooldown || !allChecksPass || loadingChallenge}
          size="lg"
          className="w-full h-12 text-base"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Generating…</>
          ) : cooldown ? "Please wait…" : !allChecksPass ? "Complete all checks above" : "Generate Vanity"}
        </Button>

        {remaining !== null && !cooldown && (
          <p className="text-xs text-muted-foreground">
            {remaining} generation{remaining !== 1 ? "s" : ""} remaining in this window
          </p>
        )}
        {cooldown && (
          <p className="text-xs text-muted-foreground">
            Rate limit reached. Please wait ~10 minutes before generating again.
          </p>
        )}
      </div>
    </div>
  );
}

function DwellTimer({ pageLoadTime, required }: { pageLoadTime: number; required: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const elapsed = now - pageLoadTime;
  const ready = elapsed >= required * 1000;
  const seconds = Math.min(Math.floor(elapsed / 1000), required);

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Clock className="w-3.5 h-3.5" />
      <span>Dwell Time — Wait {required}s ({seconds}/{required}s)</span>
      {ready && <Check className="w-3.5 h-3.5 text-green-500 ml-auto" />}
    </div>
  );
}
