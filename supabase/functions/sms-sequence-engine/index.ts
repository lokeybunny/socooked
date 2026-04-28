// SMS Sequence Engine
// Actions:
//  - enroll: { action:'enroll', sequence_id, phone, contact_name?, customer_id?, source?, source_id? }
//  - process_inbound: { action:'process_inbound', phone, body }  -> advances any active enrollment for this phone
//  - stop: { action:'stop', phone, sequence_id? }
//  - list_enrollments: { action:'list_enrollments', sequence_id? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const STOP_KEYWORDS = ["stop", "unsubscribe", "stopall", "cancel", "end", "quit"];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

async function sendSms(to: string, body: string, customer_id?: string | null) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/powerdial-sms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ action: "send", to, body, customer_id: customer_id || undefined }),
  });
  return resp.json().catch(() => ({ ok: false }));
}

async function aiReply(systemPrompt: string, conversation: { role: string; content: string }[]) {
  if (!LOVABLE_API_KEY) return null;
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt || "You are a friendly SMS assistant. Keep replies under 160 chars, conversational, and helpful. Never sound robotic." },
          ...conversation,
        ],
      }),
    });
    if (!resp.ok) {
      console.error("[sms-sequence-engine] AI gateway error", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error("[sms-sequence-engine] AI error", e);
    return null;
  }
}

async function enroll(payload: any) {
  const phone = normalizePhone(payload.phone);
  if (!phone || !payload.sequence_id) return json({ ok: false, error: "missing_phone_or_sequence" }, 400);

  const { data: existing } = await sb
    .from("sms_sequence_enrollments")
    .select("id, status")
    .eq("sequence_id", payload.sequence_id)
    .eq("phone", phone)
    .maybeSingle();

  if (existing) {
    if (existing.status === "opted_out") {
      return json({ ok: false, error: "phone_opted_out" });
    }
    // Reactivate if previously stopped/completed
    await sb.from("sms_sequence_enrollments").update({
      status: "active",
      current_step: 0,
      last_outbound_at: new Date().toISOString(),
    }).eq("id", existing.id);
    return json({ ok: true, enrollment_id: existing.id, reactivated: true });
  }

  const { data: enrollment, error } = await sb.from("sms_sequence_enrollments").insert({
    sequence_id: payload.sequence_id,
    phone,
    contact_name: payload.contact_name || null,
    customer_id: payload.customer_id || null,
    source: payload.source || null,
    source_id: payload.source_id || null,
    current_step: 0, // greet has been sent externally; awaiting reply for next step
    status: "active",
    last_outbound_at: new Date().toISOString(),
  }).select().single();

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, enrollment_id: enrollment.id });
}

async function processInbound(payload: any) {
  const phone = normalizePhone(payload.phone);
  const body = String(payload.body || "").trim();
  if (!phone || !body) return json({ ok: false, error: "missing_phone_or_body" }, 400);

  const lowered = body.toLowerCase().trim();
  const isStop = STOP_KEYWORDS.some((k) => lowered === k || lowered.startsWith(k + " "));

  // Find all active enrollments for this phone
  const { data: enrollments } = await sb
    .from("sms_sequence_enrollments")
    .select("*")
    .eq("phone", phone)
    .eq("status", "active");

  if (!enrollments || enrollments.length === 0) {
    return json({ ok: true, advanced: 0, note: "no_active_enrollments" });
  }

  const results: any[] = [];

  for (const enr of enrollments) {
    // Mark inbound timestamp
    await sb.from("sms_sequence_enrollments").update({
      last_inbound_at: new Date().toISOString(),
    }).eq("id", enr.id);

    if (isStop) {
      await sb.from("sms_sequence_enrollments").update({
        status: "opted_out",
      }).eq("id", enr.id);
      results.push({ enrollment_id: enr.id, action: "opted_out" });
      continue;
    }

    // Load sequence + steps
    const { data: seq } = await sb.from("sms_sequences").select("*").eq("id", enr.sequence_id).maybeSingle();
    if (!seq || !seq.is_active) {
      results.push({ enrollment_id: enr.id, action: "skipped_inactive_sequence" });
      continue;
    }

    const { data: steps } = await sb
      .from("sms_sequence_steps")
      .select("*")
      .eq("sequence_id", enr.sequence_id)
      .order("step_order", { ascending: true });

    const nextStepOrder = (enr.current_step || 0) + 1;
    const nextStep = steps?.find((s) => s.step_order === nextStepOrder);

    if (nextStep) {
      // Check optional reply_match — if present and reply doesn't match, fall through to AI
      let useScripted = true;
      if (nextStep.reply_match) {
        const m = String(nextStep.reply_match).toLowerCase();
        if (!lowered.includes(m)) useScripted = false;
      }

      if (useScripted) {
        const personalized = String(nextStep.body).replace(/\{first_name\}/gi, enr.contact_name?.split(" ")[0] || "there");
        await sendSms(phone, personalized, enr.customer_id);
        const isLast = nextStepOrder >= (steps?.length || 0);
        await sb.from("sms_sequence_enrollments").update({
          current_step: nextStepOrder,
          status: isLast ? "completed" : "active",
          last_outbound_at: new Date().toISOString(),
        }).eq("id", enr.id);
        results.push({ enrollment_id: enr.id, action: "advanced", step: nextStepOrder, completed: isLast });
        continue;
      }
    }

    // No matching scripted step → AI fallback if enabled
    if (seq.ai_fallback_enabled) {
      // Build short conversation from recent communications
      const last10 = phone.replace(/\D/g, "").slice(-10);
      const { data: history } = await sb
        .from("communications")
        .select("direction, body, created_at")
        .eq("type", "sms")
        .or(`from_address.ilike.%${last10}%,to_address.ilike.%${last10}%,phone_number.ilike.%${last10}%`)
        .order("created_at", { ascending: true })
        .limit(20);

      const convo = (history || []).map((m: any) => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: String(m.body || ""),
      }));
      // Ensure latest message is in convo
      if (convo.length === 0 || convo[convo.length - 1].content !== body) {
        convo.push({ role: "user", content: body });
      }

      const reply = await aiReply(seq.ai_system_prompt || "", convo);
      if (reply) {
        await sendSms(phone, reply, enr.customer_id);
        await sb.from("sms_sequence_enrollments").update({
          last_outbound_at: new Date().toISOString(),
        }).eq("id", enr.id);
        results.push({ enrollment_id: enr.id, action: "ai_reply" });
        continue;
      }
    }

    results.push({ enrollment_id: enr.id, action: "no_action" });
  }

  return json({ ok: true, results });
}

async function stop(payload: any) {
  const phone = normalizePhone(payload.phone);
  if (!phone) return json({ ok: false, error: "missing_phone" }, 400);
  let q = sb.from("sms_sequence_enrollments").update({ status: "stopped" }).eq("phone", phone).eq("status", "active");
  if (payload.sequence_id) q = q.eq("sequence_id", payload.sequence_id);
  const { error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let payload: any = {};
  try { payload = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const action = payload?.action;
  if (action === "enroll") return enroll(payload);
  if (action === "process_inbound") return processInbound(payload);
  if (action === "stop") return stop(payload);
  return json({ ok: false, error: "unknown_action" }, 400);
});
