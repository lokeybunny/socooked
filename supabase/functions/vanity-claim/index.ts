import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RATE_LIMIT = 2;
const WINDOW_MINUTES = 10;
const POW_DIFFICULTY = 6; // number of leading zeros required (was 4)
const MIN_DWELL_MS = 5000; // minimum 5 seconds on page
const CHALLENGE_TTL_MS = 90_000; // challenge valid for 90 seconds
const MIN_CAPTCHA_A = 5;
const MAX_CAPTCHA_A = 50;
const MIN_CAPTCHA_B = 5;
const MAX_CAPTCHA_B = 50;

// ── HMAC signing for tamper-proof challenges ──
async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(data, secret);
  return expected === signature;
}

// ── Verify proof-of-work: SHA-256(nonce + solution) must start with N zeros ──
async function verifyPoW(nonce: string, solution: string, difficulty: number): Promise<boolean> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(nonce + solution));
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hex.startsWith("0".repeat(difficulty));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // ─── GET = Issue a challenge ───
    if (req.method === "GET") {
      const nonce = crypto.randomUUID();
      const a = Math.floor(Math.random() * (MAX_CAPTCHA_A - MIN_CAPTCHA_A + 1)) + MIN_CAPTCHA_A;
      const b = Math.floor(Math.random() * (MAX_CAPTCHA_B - MIN_CAPTCHA_B + 1)) + MIN_CAPTCHA_B;
      // Randomly pick an operator
      const ops = ["+", "-", "×"] as const;
      const op = ops[Math.floor(Math.random() * ops.length)];
      const issued = Date.now();
      const payload = `${nonce}|${a}|${b}|${op}|${issued}`;
      const sig = await hmacSign(payload, SECRET);

      return new Response(
        JSON.stringify({
          nonce,
          captcha: { a, b, op },
          pow_difficulty: POW_DIFFICULTY,
          issued,
          sig,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── POST = Claim with security verification ───
    const body = await req.json();
    const {
      nonce, captcha_answer, pow_solution,
      honeypot, dwell_ms, issued, sig,
      captcha_a, captcha_b, captcha_op,
      mouse_movements, user_agent_hash,
    } = body;

    // ── Type validation ──
    if (typeof nonce !== "string" || typeof pow_solution !== "string" ||
        typeof captcha_a !== "number" || typeof captcha_b !== "number" ||
        typeof captcha_op !== "string" || typeof issued !== "number" ||
        typeof sig !== "string" || typeof dwell_ms !== "number") {
      return new Response(
        JSON.stringify({ error: "invalid_payload", message: "Malformed request." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Mouse movement validation (server-side) ──
    if (typeof mouse_movements !== "number" || mouse_movements < 10) {
      return new Response(
        JSON.stringify({ error: "bot_behavior", message: "Insufficient interaction detected." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1️⃣ Honeypot check — must be empty
    if (honeypot) {
      return new Response(
        JSON.stringify({ error: "bot_detected", message: "Request rejected." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2️⃣ Verify challenge signature (tamper-proof)
    const payload = `${nonce}|${captcha_a}|${captcha_b}|${captcha_op}|${issued}`;
    const validSig = await hmacVerify(payload, sig, SECRET);
    if (!validSig) {
      return new Response(
        JSON.stringify({ error: "invalid_challenge", message: "Challenge tampered or invalid." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3️⃣ Challenge expiry
    if (Date.now() - issued > CHALLENGE_TTL_MS) {
      return new Response(
        JSON.stringify({ error: "challenge_expired", message: "Challenge expired. Please refresh and try again." }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4️⃣ Math CAPTCHA verification (supports +, -, ×)
    let expectedAnswer: number;
    if (captcha_op === "+") expectedAnswer = captcha_a + captcha_b;
    else if (captcha_op === "-") expectedAnswer = captcha_a - captcha_b;
    else if (captcha_op === "×") expectedAnswer = captcha_a * captcha_b;
    else {
      return new Response(
        JSON.stringify({ error: "invalid_op", message: "Invalid captcha operator." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (Number(captcha_answer) !== expectedAnswer) {
      return new Response(
        JSON.stringify({ error: "captcha_failed", message: "Incorrect CAPTCHA answer." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5️⃣ Proof of Work verification
    const powValid = await verifyPoW(nonce, pow_solution, POW_DIFFICULTY);
    if (!powValid) {
      return new Response(
        JSON.stringify({ error: "pow_failed", message: "Proof of work invalid." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6️⃣ Dwell time check
    if (!dwell_ms || dwell_ms < MIN_DWELL_MS) {
      return new Response(
        JSON.stringify({ error: "too_fast", message: "Please spend more time on the page before generating." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── All checks passed, proceed with claim ───
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rate limit
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count, error: countErr } = await supabase
      .from("vanities")
      .select("*", { count: "exact", head: true })
      .eq("claimed_ip", ip)
      .gte("claimed_at", windowStart);

    if (countErr) throw countErr;

    if ((count ?? 0) >= RATE_LIMIT) {
      return new Response(
        JSON.stringify({
          error: "rate_limited",
          message: `You can only claim ${RATE_LIMIT} vanities every ${WINDOW_MINUTES} minutes. Please wait and try again.`,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Claim vanity
    const { data: vanity, error: fetchErr } = await supabase
      .from("vanities")
      .select("id, value")
      .is("claimed_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (fetchErr || !vanity) {
      return new Response(
        JSON.stringify({ error: "exhausted", message: "All vanities have been claimed. Check back later!" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: claimed, error: updateErr } = await supabase
      .from("vanities")
      .update({ claimed_at: new Date().toISOString(), claimed_ip: ip })
      .eq("id", vanity.id)
      .is("claimed_at", null)
      .select("value")
      .single();

    if (updateErr || !claimed) {
      // Race condition retry
      const { data: retry, error: retryErr } = await supabase
        .from("vanities")
        .select("id, value")
        .is("claimed_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (retryErr || !retry) {
        return new Response(
          JSON.stringify({ error: "exhausted", message: "All vanities have been claimed." }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: retryClaimed, error: retryUpErr } = await supabase
        .from("vanities")
        .update({ claimed_at: new Date().toISOString(), claimed_ip: ip })
        .eq("id", retry.id)
        .is("claimed_at", null)
        .select("value")
        .single();

      if (retryUpErr || !retryClaimed) {
        return new Response(
          JSON.stringify({ error: "busy", message: "Too busy right now, please try again." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ vanity: retryClaimed.value }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const remaining = RATE_LIMIT - ((count ?? 0) + 1);

    return new Response(
      JSON.stringify({ vanity: claimed.value, remaining }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("vanity-claim error:", err);
    return new Response(
      JSON.stringify({ error: "server_error", message: "Something went wrong." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
