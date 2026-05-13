import {
  advanceCampaign,
  cancelSiblingCalls,
  DEFAULT_POWERDIAL_SETTINGS,
  normalizePhone,
  prepareVapiOutboundAssistant,
  resolvePowerDialAssistantId,
  sanitizePowerDialAssistantId,
  sb,
} from "../_shared/powerdial.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY")!;
const VAPI_PHONE_NUMBER_ID = Deno.env.get("VAPI_PHONE_NUMBER_ID") || "";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// Speech-gate thresholds — tuned to ignore brief line noise (clicks, breaths,
// background TV, hold-music transients) and only engage the AI on sustained
// human speech.
//
//  - POST_PICKUP_DEBOUNCE_MS: ignore the very first window after pickup, where
//    Twilio often reports tiny audio bursts that are NOT real speech.
//  - HUMAN_SPEECH_MIN_AUDIO_MS: total sustained voiced-audio duration that
//    must be present before we call it a confirmed human.
const POST_PICKUP_DEBOUNCE_MS = 400;
const HUMAN_SPEECH_MIN_AUDIO_MS = 1200;
// Must exceed Twilio MachineDetectionTimeout (30s). If this hold ends at the
// same time AMD returns, Twilio hangs up before we can redirect the live call
// to the voicemail <Play>, leaving VMD stuck on "waiting" with no drop.
const AMD_HOLD_SECONDS = 75;

// Auto-SMS after transfer is OFF by default — only fires when explicitly enabled
// in PowerDialSettings (settings.sms_after_transfer === true) with a non-empty body.
const DEFAULT_SMS_AFTER_TRANSFER = "";
const DEFAULT_VOICEMAIL_DROP_SMS = "";

/**
 * Fires a one-shot SMS to the lead the moment we hand them off to a live agent.
 * Logs a row in `communications` so it shows up in the PowerD SMS inbox.
 */
async function sendTransferSms(opts: {
  leadPhone: string;
  message: string;
  campaignId: string;
  callLogId: string;
  customerId?: string | null;
  sequenceId?: string | null;
  contactName?: string | null;
}): Promise<void> {
  try {
    const to = normalizePhone(opts.leadPhone);
    const from = normalizePhone(TWILIO_FROM_NUMBER);
    if (!to || !from || !opts.message?.trim()) {
      console.warn(`[powerdial-webhook] Skipping transfer SMS — to=${to} from=${from} hasBody=${!!opts.message}`);
      return;
    }

    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: from, Body: opts.message }).toString(),
      },
    );
    const data = await resp.json().catch(() => ({} as any));
    const ok = resp.ok;
    if (!ok) {
      console.error(`[powerdial-webhook] Transfer SMS Twilio error ${resp.status}:`, data);
    } else {
      console.log(`[powerdial-webhook] Transfer SMS sent to ${to} (sid=${data?.sid})`);
    }

    await sb.from("communications").insert({
      type: "sms",
      direction: "outbound",
      body: opts.message,
      from_address: from,
      to_address: to,
      phone_number: to,
      provider: "twilio",
      external_id: data?.sid || null,
      status: ok ? "sent" : "failed",
      customer_id: opts.customerId || null,
      metadata: {
        source: "powerdial-transfer-sms",
        campaign_id: opts.campaignId,
        call_log_id: opts.callLogId,
        ...(ok ? {} : { error: data?.message || `twilio_${resp.status}` }),
      },
    });

    // Auto-enroll into selected sequence (if any) on successful greet send
    if (ok && opts.sequenceId) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/sms-sequence-engine`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({
            action: "enroll",
            sequence_id: opts.sequenceId,
            phone: to,
            contact_name: opts.contactName || null,
            customer_id: opts.customerId || null,
            source: "powerdial_campaign",
            source_id: opts.campaignId,
          }),
        });
      } catch (e) {
        console.error("[powerdial-webhook] sequence enroll error:", e);
      }
    }
  } catch (err) {
    console.error("[powerdial-webhook] Transfer SMS exception:", err);
  }
}

async function claimVoicemailDrop(callLogId: string): Promise<boolean> {
  if (!callLogId) return false;
  const claimedAt = new Date().toISOString();
  const { data, error } = await sb
    .from("powerdial_call_logs")
    .update({ voicemail_drop_claimed_at: claimedAt })
    .eq("id", callLogId)
    .is("voicemail_drop_claimed_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[powerdial-webhook] Voicemail drop claim error:", error);
    return false;
  }
  return Boolean(data);
}

async function claimVoicemailDropSms(callLogId: string): Promise<boolean> {
  if (!callLogId) return false;
  const { data, error } = await sb
    .from("powerdial_call_logs")
    .update({ voicemail_drop_sms_status: "sending" })
    .eq("id", callLogId)
    .is("voicemail_drop_sms_sent_at", null)
    .or("voicemail_drop_sms_status.is.null,voicemail_drop_sms_status.eq.failed")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[powerdial-webhook] VM-drop SMS claim error:", error);
    return false;
  }
  return Boolean(data);
}

async function markVoicemailDropSms(callLogId: string, ok: boolean, error?: string) {
  if (!callLogId) return;
  await sb.from("powerdial_call_logs").update({
    voicemail_drop_sms_status: ok ? "sent" : "failed",
    voicemail_drop_sms_sent_at: ok ? new Date().toISOString() : null,
  }).eq("id", callLogId);
  if (error) console.error(`[powerdial-webhook] VM-drop SMS marked failed for ${callLogId}: ${error}`);
}

async function sendVoicemailDropSms(opts: {
  leadPhone: string;
  message: string;
  campaignId: string;
  callLogId: string;
  customerId?: string | null;
  voicemailDropUrl?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const to = normalizePhone(opts.leadPhone);
  if (!to || !opts.message.trim()) return { ok: false, error: "missing_to_or_body" };
  if (!SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: "missing_service_role_key" };

  try {
    const smsResp = await fetch(`${SUPABASE_URL}/functions/v1/powerdial-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        action: "send",
        to,
        body: opts.message,
        customer_id: opts.customerId || null,
        source: "powerdial-voicemail-drop-sms",
        metadata: {
          source: "powerdial-voicemail-drop-sms",
          campaign_id: opts.campaignId,
          call_log_id: opts.callLogId,
          voicemail_drop_url: opts.voicemailDropUrl || null,
        },
      }),
    });
    const smsText = await smsResp.text();
    let data: any = {};
    try { data = smsText ? JSON.parse(smsText) : {}; } catch { data = { raw: smsText }; }
    if (!smsResp.ok || data?.ok === false) {
      const error = data?.error || data?.message || smsText.slice(0, 300) || `sms_http_${smsResp.status}`;
      console.error(`[powerdial-webhook] VM-drop VoidFix SMS failed [${smsResp.status}]:`, error);
      return { ok: false, error };
    }
    console.log(`[powerdial-webhook] VM-drop VoidFix SMS sent to ${to}`);
    return { ok: true };
  } catch (err) {
    const error = String(err);
    console.error("[powerdial-webhook] VM-drop VoidFix SMS exception:", err);
    return { ok: false, error };
  }
}

function twimlResponse(xml: string) {
  return new Response(xml, {
    headers: { ...CORS, "Content-Type": "text/xml" },
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function appendVmdTimeline(meta: Record<string, unknown>, event: string, details: Record<string, unknown> = {}) {
  const existing = Array.isArray((meta as any).vmd_timeline) ? (meta as any).vmd_timeline : [];
  return {
    ...meta,
    vmd_timeline: [
      ...existing.slice(-39),
      { at: new Date().toISOString(), event, ...details },
    ],
  };
}

async function logVmdTimeline(callLogId: string, event: string, details: Record<string, unknown> = {}) {
  if (!callLogId) return;
  const { data } = await sb.from("powerdial_call_logs").select("meta").eq("id", callLogId).maybeSingle();
  const meta = data?.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
    ? data.meta as Record<string, unknown>
    : {};
  await sb.from("powerdial_call_logs").update({ meta: appendVmdTimeline(meta, event, details) }).eq("id", callLogId);
}

function isLegacyDefaultVoicemailUrl(value: string | null) {
  if (!value) return false;
  return value.includes("powerdial-voicemail-audio?file=warren") || value.includes("voicemail-warren.mp3");
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasConfirmedHumanSpeech(answeredBy: string, machineDetectionDuration: string): boolean {
  const durationMs = Number(machineDetectionDuration || 0);
  if (answeredBy !== "human") return false;
  if (!Number.isFinite(durationMs)) return false;
  // Debounce: first POST_PICKUP_DEBOUNCE_MS of audio after pickup is treated
  // as line noise and ignored. After that window, the caller must still have
  // produced HUMAN_SPEECH_MIN_AUDIO_MS of sustained voiced audio.
  if (durationMs < POST_PICKUP_DEBOUNCE_MS) return false;
  return durationMs >= HUMAN_SPEECH_MIN_AUDIO_MS;
}

async function getVapiPhoneNumber(phoneNumberId: string): Promise<string | null> {
  if (!phoneNumberId) return null;

  try {
    const resp = await fetch(`https://api.vapi.ai/phone-number/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[powerdial-webhook] Vapi phone lookup error:", errText);
      return null;
    }

    const data = await resp.json();
    return data.number || data.phoneNumber || null;
  } catch (err) {
    console.error("[powerdial-webhook] Vapi phone lookup exception:", err);
    return null;
  }
}

function buildPowerDialWebhookUrl(type: string, campaignId: string, queueItemId: string, callLogId: string) {
  const webhookUrl = new URL(`${SUPABASE_URL}/functions/v1/powerdial-webhook`);
  webhookUrl.searchParams.set("type", type);
  webhookUrl.searchParams.set("campaign_id", campaignId);
  webhookUrl.searchParams.set("queue_item_id", queueItemId);
  webhookUrl.searchParams.set("call_log_id", callLogId);
  return webhookUrl.toString();
}

async function redirectCallToVapi(
  callSid: string,
  vapiPhoneNumber: string,
  assistantId: string,
  options: {
    campaignId: string;
    queueItemId: string;
    callLogId: string;
    twilioFrom?: string;
  },
): Promise<boolean> {
  try {
    const resolvedCallerId = normalizePhone(options.twilioFrom);
    const callerIdAttr = resolvedCallerId ? ` callerId="${escapeXml(resolvedCallerId)}"` : "";
    const dialCompleteUrl = buildPowerDialWebhookUrl(
      "dial-complete",
      options.campaignId,
      options.queueItemId,
      options.callLogId,
    );

    // For live human transfer, suppress the ringback the lead hears while
    // we connect the human agent. We do this by NOT using answerOnBridge —
    // Twilio answers the inbound leg immediately (silent), then bridges to
    // the agent. The lead hears silence instead of ringing, giving a fluid
    // "instant connect" power-dialer feel.
    const isHumanTransfer = assistantId === "live-human-transfer";
    const answerOnBridge = isHumanTransfer ? "false" : "true";

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="30" answerOnBridge="${answerOnBridge}" action="${escapeXml(dialCompleteUrl)}" method="POST"${callerIdAttr}>
    <Number>${escapeXml(vapiPhoneNumber)}</Number>
  </Dial>
</Response>`;

    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Twiml: twiml }).toString(),
      },
    );

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[powerdial-webhook] Twilio redirect error:", errText);
      return false;
    }

    console.log(`[powerdial-webhook] Call ${callSid} redirected to Vapi number ${vapiPhoneNumber} with assistant ${assistantId}`);
    return true;
  } catch (err) {
    console.error("[powerdial-webhook] Redirect exception:", err);
    return false;
  }
}

const DEFAULT_AI_ASSIST_GREETING =
  "Please hold while I transfer you to Warren about your property listing.";

// Snappier greeting used when AMD reports a confident, fast human answer
// (Twilio AnsweredBy === "human"). Shaves ~2s of audio off the first words.
const SHORT_AI_ASSIST_GREETING =
  DEFAULT_AI_ASSIST_GREETING;

// ElevenLabs voice used for the AI Assist warm hand-off greeting.
const AI_ASSIST_ELEVENLABS_VOICE_ID = "eXpIbVcVbLo8ZJQDlDnl";

// Pre-warm both greetings at module boot so the very first call after a
// cold start doesn't pay the ~800ms TTS round-trip.
queueMicrotask(() => {
  generateElevenLabsGreetingBytes(AI_ASSIST_ELEVENLABS_VOICE_ID, DEFAULT_AI_ASSIST_GREETING)
    .catch(() => {/* swallow — fallback path handles failures */});
  generateElevenLabsGreetingBytes(AI_ASSIST_ELEVENLABS_VOICE_ID, SHORT_AI_ASSIST_GREETING)
    .catch(() => {/* swallow */});
});

/**
 * Renders a warm-handoff greeting through ElevenLabs as MP3 bytes.
 * Uses an in-memory cache keyed by (voice + text) hash so repeat calls
 * don't re-hit the API. Returns null if generation fails.
 */
const elevenAudioCache = new Map<string, Uint8Array>();

async function fingerprintGreeting(voiceId: string, text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${voiceId}::${text}`),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function generateElevenLabsGreetingBytes(
  voiceId: string,
  greetingText: string,
): Promise<Uint8Array | null> {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    console.warn("[powerdial-webhook] ELEVENLABS_API_KEY missing — falling back to Polly");
    return null;
  }

  try {
    const hash = await fingerprintGreeting(voiceId, greetingText);
    const cached = elevenAudioCache.get(hash);
    if (cached) return cached;

    const ttsResp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: greetingText,
          model_id: "eleven_flash_v2_5", // ~50% lower latency than turbo
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0.35,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!ttsResp.ok) {
      const errText = await ttsResp.text();
      console.error(`[powerdial-webhook] ElevenLabs TTS failed (${ttsResp.status}):`, errText);
      return null;
    }

    const bytes = new Uint8Array(await ttsResp.arrayBuffer());
    elevenAudioCache.set(hash, bytes);
    console.log(`[powerdial-webhook] ElevenLabs greeting generated (${bytes.length} bytes)`);
    return bytes;
  } catch (err) {
    console.error("[powerdial-webhook] ElevenLabs greeting generation error:", err);
    return null;
  }
}

/**
 * Builds a public URL pointing back at this webhook that, when fetched by Twilio,
 * streams the ElevenLabs MP3 inline. No storage bucket required.
 */
async function buildAIGreetingUrl(voiceId: string, greetingText: string): Promise<string | null> {
  const hash = await fingerprintGreeting(voiceId, greetingText);
  // Pre-warm cache so the audio request doesn't have to wait on TTS round-trip
  // (Twilio will fetch it within ~200ms).
  const bytes = await generateElevenLabsGreetingBytes(voiceId, greetingText);
  if (!bytes) return null;

  const url = new URL(`${SUPABASE_URL}/functions/v1/powerdial-webhook`);
  url.searchParams.set("type", "ai-greeting");
  url.searchParams.set("voice", voiceId);
  url.searchParams.set("hash", hash);
  url.searchParams.set("text", greetingText);
  return url.toString();
}

/**
 * PowerDial AI Assist handoff: no greeting, no verification prompt, no whisper.
 * Once a human is detected, Twilio silently bridges the lead straight to the
 * configured live agent number. Regular inbound phone calls still use the
 * separate twilio-whisper press-1 flow and are intentionally untouched.
 */
async function redirectCallToAIAssistTransfer(
  callSid: string,
  humanTransferPhone: string,
  greetingText: string,
  options: {
    campaignId: string;
    queueItemId: string;
    callLogId: string;
    twilioFrom?: string;
    /** Twilio AnsweredBy value — when "human" we use the snappier greeting. */
    answeredBy?: string;
  },
): Promise<boolean> {
  try {
    const resolvedCallerId = normalizePhone(options.twilioFrom);
    const callerIdAttr = resolvedCallerId ? ` callerId="${escapeXml(resolvedCallerId)}"` : "";
    const dialCompleteUrl = buildPowerDialWebhookUrl(
      "dial-complete",
      options.campaignId,
      options.queueItemId,
      options.callLogId,
    );

    // PowerDial-only behavior: bridge directly with NO greeting, NO whisper,
    // NO name screening — instant silent handoff to the human agent line.
    void greetingText;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="30" answerOnBridge="false" action="${escapeXml(dialCompleteUrl)}" method="POST"${callerIdAttr}>
    <Number>${escapeXml(humanTransferPhone)}</Number>
  </Dial>
</Response>`;

    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Twiml: twiml }).toString(),
      },
    );

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[powerdial-webhook] AI Assist redirect error:", errText);
      return false;
    }

    console.log(
      `[powerdial-webhook] AI Assist warm handoff: ${callSid} → greeting then bridge ${humanTransferPhone}`,
    );
    return true;
  } catch (err) {
    console.error("[powerdial-webhook] AI Assist redirect exception:", err);
    return false;
  }
}

async function handleCallCompletion(
  campaignId: string,
  queueItemId: string,
  callLogId: string,
  source: "status" | "dial-complete",
) {
  // Mark call as fully terminal FIRST so hasActiveConnectedCall won't block next batch
  await sb.from("powerdial_call_logs").update({
    twilio_status: "completed",
    connected_to_vapi: false,
  }).eq("id", callLogId);

  // CRITICAL: also flip the queue item out of "dialing" so dialNextBatch() doesn't
  // get blocked by an "already_dialing" guard on a finished human call. Without
  // this, after a human call wraps up the campaign sits on remaining "pending"
  // items forever even though the line is free.
  await updateQueueStatusOnce(queueItemId, {
    status: "completed",
    last_result: "human_completed",
  });

  const { data: qItem } = await sb.from("powerdial_queue").select("phone, contact_name").eq("id", queueItemId).single();

  if (qItem?.phone) {
    // Wait for Vapi to finish processing the call before fetching
    await new Promise((r) => setTimeout(r, 5000));

    const matchedCall = await fetchRecentVapiCallForPhone(qItem.phone);
    if (matchedCall) {
      const transcript = matchedCall.transcript ||
        matchedCall.messages?.map((message: any) => `${message.role}: ${message.content}`).join("\n") || null;

      await sb.from("powerdial_call_logs").update({
        vapi_call_id: matchedCall.id,
        transcript,
        summary: matchedCall.analysis?.summary || matchedCall.summary || null,
        disposition: matchedCall.analysis?.successEvaluation || null,
        recording_url: matchedCall.recordingUrl || matchedCall.artifact?.recordingUrl || null,
        follow_up_needed: matchedCall.analysis?.successEvaluation === "follow_up",
      }).eq("id", callLogId);
      console.log(`[powerdial-webhook] Matched Vapi call from ${source}: ${matchedCall.id}`);

      await analyzeAndLabelPowerDialLead(callLogId, campaignId, queueItemId, qItem.phone, matchedCall);
    } else {
      console.log(`[powerdial-webhook] No Vapi call matched for phone ${qItem.phone} after ${source}`);
      // Schedule a retry after 15 seconds via a deferred fetch
      setTimeout(async () => {
        try {
          const retryCall = await fetchRecentVapiCallForPhone(qItem.phone);
          if (retryCall) {
            const retryTranscript = retryCall.transcript ||
              retryCall.messages?.map((m: any) => `${m.role}: ${m.content}`).join("\n") || null;
            await sb.from("powerdial_call_logs").update({
              vapi_call_id: retryCall.id,
              transcript: retryTranscript,
              summary: retryCall.analysis?.summary || retryCall.summary || null,
              disposition: retryCall.analysis?.successEvaluation || null,
              recording_url: retryCall.recordingUrl || retryCall.artifact?.recordingUrl || null,
              follow_up_needed: retryCall.analysis?.successEvaluation === "follow_up",
            }).eq("id", callLogId);
            console.log(`[powerdial-webhook] Retry matched Vapi call: ${retryCall.id}`);
            await analyzeAndLabelPowerDialLead(callLogId, campaignId, queueItemId, qItem.phone, retryCall);
          }
        } catch (err) {
          console.error("[powerdial-webhook] Retry match error:", err);
        }
      }, 15000);
    }
  }

  const advanceResult = await advanceCampaign(campaignId, "[powerdial-webhook]");
  console.log(`[powerdial-webhook] Advance after ${source} completion for ${campaignId}:`, advanceResult);
  return advanceResult;
}

async function updateQueueStatusOnce(
  queueItemId: string,
  values: Record<string, unknown>,
  allowedStatuses: string[] = ["dialing"],
) {
  if (!queueItemId) return false;

  const { data } = await sb
    .from("powerdial_queue")
    .update(values)
    .eq("id", queueItemId)
    .in("status", allowedStatuses)
    .select("id")
    .maybeSingle();

  return Boolean(data);
}

async function bumpCampaignCount(
  campaignId: string,
  field: "human_count" | "voicemail_count" | "busy_count" | "no_answer_count" | "failed_count",
) {
  const { data: campaign } = await sb
    .from("powerdial_campaigns")
    .select("human_count, voicemail_count, busy_count, no_answer_count, failed_count, completed_count")
    .eq("id", campaignId)
    .single();

  if (!campaign) return;

  const currentValue = Number((campaign as any)[field] || 0);
  await sb.from("powerdial_campaigns").update({
    [field]: currentValue + 1,
    completed_count: Number(campaign.completed_count || 0) + 1,
  }).eq("id", campaignId);
}

async function fetchRecentVapiCallForPhone(phone: string) {
  try {
    const vapiResp = await fetch("https://api.vapi.ai/call?limit=50", {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
    });

    if (!vapiResp.ok) {
      const errText = await vapiResp.text();
      console.error("[powerdial-webhook] Vapi list calls error:", errText);
      return null;
    }

    const vapiCalls = await vapiResp.json();
    const rawDigits = phone.replace(/\D/g, "");
    const last10 = rawDigits.slice(-10);

    // Match by customer number OR by phoneNumber field (bridged calls)
    const matched = (vapiCalls || []).find((call: any) => {
      // Check customer.number (standard Vapi field)
      const custNumber = String(call.customer?.number || "").replace(/\D/g, "");
      if (custNumber && last10 === custNumber.slice(-10)) return true;
      // Check phoneNumber field (some Vapi versions)
      const pn = String(call.phoneNumber || "").replace(/\D/g, "");
      if (pn && last10 === pn.slice(-10)) return true;
      // Check metadata/destination
      const dest = String(call.destination?.number || call.metadata?.destination || "").replace(/\D/g, "");
      if (dest && last10 === dest.slice(-10)) return true;
      return false;
    });

    if (matched) return matched;

    // Fallback: match by recent time window (last 5 min) if it was a completed call
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const recentCompleted = (vapiCalls || []).find((call: any) => {
      if (call.status !== "ended") return false;
      const callEnd = new Date(call.endedAt || call.updatedAt || 0).getTime();
      return callEnd > fiveMinAgo;
    });

    if (recentCompleted) {
      console.log(`[powerdial-webhook] Fallback time-match for ${phone}: Vapi call ${recentCompleted.id}`);
      return recentCompleted;
    }

    return null;
  } catch (err) {
    console.error("[powerdial-webhook] Vapi fetch error:", err);
    return null;
  }
}

/** After a completed Vapi call, analyze transcript and push interested leads to CRM */
async function analyzeAndLabelPowerDialLead(
  callLogId: string,
  campaignId: string,
  queueItemId: string,
  phone: string,
  matchedCall: any,
) {
  try {
    const transcript = matchedCall.transcript ||
      matchedCall.messages?.map((m: any) => `${m.role}: ${m.content}`).join("\n") || "";
    const summary = matchedCall.analysis?.summary || matchedCall.summary || "";
    const disposition = matchedCall.analysis?.successEvaluation || "";

    // Determine if lead is interested based on Vapi analysis or keywords
    const interestSignals = [
      "interested", "yes", "sure", "tell me more", "sounds good",
      "schedule", "appointment", "book", "meeting", "callback",
      "follow_up", "follow up", "success",
    ];

    const notInterestedSignals = [
      "not interested", "no thanks", "don't call", "remove me",
      "stop calling", "hang up", "wrong number", "do not call",
    ];

    const lowerTranscript = (transcript + " " + summary + " " + disposition).toLowerCase();
    const isNotInterested = notInterestedSignals.some((s) => lowerTranscript.includes(s));
    const isInterested = !isNotInterested && interestSignals.some((s) => lowerTranscript.includes(s));

    if (!isInterested) {
      console.log(`[powerdial-webhook] Lead at ${phone} not interested or inconclusive, skipping CRM push`);
      return;
    }

    // Check if customer already exists by phone
    const normalizedPhone = normalizePhone(phone);
    const digits = normalizedPhone.replace(/\D/g, "");
    const last10 = digits.slice(-10);

    const { data: existing } = await sb
      .from("customers")
      .select("id, tags, meta, status")
      .or(`phone.ilike.%${last10}%`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Update existing customer with power_dialed tag and status
      const currentTags: string[] = Array.isArray(existing.tags) ? existing.tags : [];
      const newTags = [...new Set([...currentTags, "power_dialed"])];
      const currentMeta = existing.meta && typeof existing.meta === "object" && !Array.isArray(existing.meta)
        ? existing.meta as Record<string, unknown>
        : {};

      await sb.from("customers").update({
        tags: newTags,
        status: existing.status === "lead" ? "prospect" : existing.status,
        source: "webdesign-landing",
        meta: {
          ...currentMeta,
          powerdial_campaign_id: campaignId,
          powerdial_interested: true,
          powerdial_transcript_summary: summary.slice(0, 500),
          powerdial_call_log_id: callLogId,
          vapi_call_id: matchedCall.id || currentMeta.vapi_call_id || null,
          vapi_call_status: "completed",
          vapi_transcript: transcript.slice(0, 2000),
          vapi_summary: summary.slice(0, 1000),
          vapi_ai_notes: `[PowerD] ${summary.slice(0, 500)}`,
        },
      }).eq("id", existing.id);

      console.log(`[powerdial-webhook] Updated existing customer ${existing.id} with power_dialed tag`);
    } else {
      // Create new customer from power dial
      const { data: qItem } = await sb
        .from("powerdial_queue")
        .select("contact_name, customer_id")
        .eq("id", queueItemId)
        .single();

      await sb.from("customers").insert({
        full_name: qItem?.contact_name || `Power Dialed ${last10}`,
        phone: normalizedPhone,
        status: "prospect",
        source: "webdesign-landing",
        tags: ["power_dialed"],
        meta: {
          powerdial_campaign_id: campaignId,
          powerdial_interested: true,
          powerdial_transcript_summary: summary.slice(0, 500),
          powerdial_call_log_id: callLogId,
          vapi_call_id: matchedCall.id || null,
          vapi_call_status: "completed",
          vapi_transcript: transcript.slice(0, 2000),
          vapi_summary: summary.slice(0, 1000),
          vapi_ai_notes: `[PowerD] ${summary.slice(0, 500)}`,
        },
      });

      console.log(`[powerdial-webhook] Created new customer from power dial for ${normalizedPhone}`);
    }

    // Mark call log as lead pushed
    await sb.from("powerdial_call_logs").update({
      follow_up_needed: true,
      disposition: "interested",
    }).eq("id", callLogId);
  } catch (err) {
    console.error("[powerdial-webhook] Lead labeling error:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const campaignId = url.searchParams.get("campaign_id") || "";
  const queueItemId = url.searchParams.get("queue_item_id") || "";
  const callLogId = url.searchParams.get("call_log_id") || "";

  try {
    // Inline ElevenLabs MP3 streaming endpoint that Twilio <Play> hits.
    // No storage bucket / no auth — pure pass-through with in-memory cache.
    if (type === "ai-greeting") {
      const voice = url.searchParams.get("voice") || "";
      const text = url.searchParams.get("text") || "";
      if (!voice || !text) {
        return new Response("Missing voice or text", { status: 400 });
      }
      const bytes = await generateElevenLabsGreetingBytes(voice, text);
      if (!bytes) {
        return new Response("TTS unavailable", { status: 502 });
      }
      const audioBody = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      return new Response(audioBody, {
        status: 200,
        headers: {
          ...CORS,
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=86400",
          "Content-Length": String(bytes.length),
        },
      });
    }

    if (type === "twiml") {
      const formText = await req.text().catch(() => "");
      const params = new URLSearchParams(formText);
      const twilioFrom = params.get("From") || "";
      const dialCompleteUrl = buildPowerDialWebhookUrl("dial-complete", campaignId, queueItemId, callLogId);

      const [{ data: existingLog }, { data: campSettings }] = await Promise.all([
        callLogId
          ? sb.from("powerdial_call_logs").select("meta").eq("id", callLogId).maybeSingle()
          : Promise.resolve({ data: null } as any),
        campaignId
          ? sb.from("powerdial_campaigns").select("settings").eq("id", campaignId).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);

      let existingMeta = existingLog?.meta && typeof existingLog.meta === "object" && !Array.isArray(existingLog.meta)
        ? existingLog.meta as Record<string, unknown>
        : {};
      const settingsObj = {
        ...DEFAULT_POWERDIAL_SETTINGS,
        ...((campSettings?.settings || {}) as Record<string, unknown>),
      } as Record<string, unknown>;
      const callerId = normalizePhone(twilioFrom || String(existingMeta.resolved_from || ""));
      const callerIdAttr = callerId ? ` callerId="${escapeXml(callerId)}"` : "";
      const humanTransferPhone = normalizePhone(typeof settingsObj.human_transfer_phone === "string" ? settingsObj.human_transfer_phone : "");
      const aiEnabled = settingsObj.ai_enabled !== false;
      const aiAssistEnabled = settingsObj.ai_assist !== false;
      const vmDropOnlyMode = (settingsObj as any).voicemail_drop_only === true;

      let mode = "hold_for_amd";
      let xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="${AMD_HOLD_SECONDS}"/><Hangup/></Response>`;

      // In voicemail-drop-only mode, never bridge to a human up-front. Always
      // wait for AMD so we can detect voicemail (drop the recording) or human
      // (hang up + requeue).
      if (!vmDropOnlyMode && !aiEnabled && humanTransferPhone) {
        mode = "live_human_transfer_immediate";
        xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="30" answerOnBridge="false" action="${escapeXml(dialCompleteUrl)}" method="POST"${callerIdAttr}>
    <Number>${escapeXml(humanTransferPhone)}</Number>
  </Dial>
</Response>`;
      }

      if (callLogId) {
        const timelineMeta = appendVmdTimeline(existingMeta, "twilio_twiml_answered", {
          type,
          call_sid: params.get("CallSid") || null,
          from: twilioFrom || null,
          to: params.get("To") || null,
          mode,
          hold_seconds: mode === "hold_for_amd" ? AMD_HOLD_SECONDS : null,
          vm_drop_only: vmDropOnlyMode,
        });
        await sb.from("powerdial_call_logs").update({
          connected_to_vapi: false,
          ...(mode === "live_human_transfer_immediate" ? { disposition: "transferred_to_human" } : {}),
          meta: {
            ...timelineMeta,
            immediate_answer_twiml: mode !== "hold_for_amd",
            immediate_answer_mode: mode,
            twilio_from: callerId || null,
          },
        }).eq("id", callLogId);
      }

      return twimlResponse(xml);
    }

    const formText = await req.text();
    const params = new URLSearchParams(formText);
    const callSid = params.get("CallSid") || "";
    const callStatus = params.get("CallStatus") || "";
    const twilioFrom = params.get("From") || "";

    if (callLogId && ["amd", "status", "dial-complete"].includes(type || "")) {
      await logVmdTimeline(callLogId, "twilio_webhook_received", {
        type,
        call_sid: callSid || null,
        call_status: callStatus || null,
        answered_by: params.get("AnsweredBy") || null,
        machine_detection_duration_ms: params.get("MachineDetectionDuration") || null,
        from: twilioFrom || null,
        to: params.get("To") || null,
      });
    }

    if (type === "amd") {
      const answeredBy = params.get("AnsweredBy") || "";
      const machineDetectionDuration = params.get("MachineDetectionDuration") || "";
      console.log(`[powerdial-webhook] AMD result: ${answeredBy} for call ${callSid} (duration=${machineDetectionDuration}ms)`);

      // Check if AI is disabled — if so, we bypass AMD entirely and bridge any answer to the human
      const { data: campSettingsForAmd } = await sb
        .from("powerdial_campaigns")
        .select("settings")
        .eq("id", campaignId)
        .single();
      const aiEnabledForAmd = (campSettingsForAmd?.settings as any)?.ai_enabled !== false;
      const vmDropOnlyForAmd = (campSettingsForAmd?.settings as any)?.voicemail_drop_only === true;

      let amdResult = "unknown";
      let connectVapi = false;
      let intendedAction = "";
      // VM-drop-only signal: when true, the AMD branch will route this call
      // through the vm-drop-only hangup-and-requeue path (not the Vapi/human
      // bridge path). This catches AMD mis-classifications too — anything
      // that isn't a CONFIDENT voicemail-ready state (beep / end-silence)
      // gets treated as a human pickup and hung up immediately.
      let vmDropOnlyHumanHangup = false;

      if (vmDropOnlyForAmd) {
        // Voicemail-ready states: only "machine_end_*" means Twilio has heard
        // the mailbox greeting finish / beep. Do NOT drop on machine_start —
        // that fires at the start of the greeting and plays over the mailbox.
        const isConfidentVoicemailReady =
          answeredBy.startsWith("machine_end") ||
          answeredBy === "fax";
        if (isConfidentVoicemailReady) {
          amdResult = "voicemail";
          intendedAction = `vm_drop_only_voicemail_drop (AMD=${answeredBy})`;
        } else {
          amdResult = answeredBy === "human" || hasConfirmedHumanSpeech(answeredBy, machineDetectionDuration)
            ? "human"
            : "unknown";
          connectVapi = true; // route into the connectVapi block, which will detect vm_drop_only and hang up + requeue
          vmDropOnlyHumanHangup = true;
          intendedAction = `vm_drop_only_hangup_and_requeue (AMD=${answeredBy || "empty"}, not a confident voicemail-ready state)`;
        }
      } else if (!aiEnabledForAmd) {
        amdResult = "human";
        connectVapi = true;
        intendedAction = "redirect_to_human_transfer (AI disabled — bypass AMD)";
        console.log(`[powerdial-webhook] AI disabled — forcing human-transfer path regardless of AMD result (${answeredBy})`);
      } else if (hasConfirmedHumanSpeech(answeredBy, machineDetectionDuration)) {
        amdResult = "human";
        connectVapi = true;
        intendedAction = `redirect_to_vapi_assistant (sustained human speech >=${HUMAN_SPEECH_MIN_AUDIO_MS}ms after ${POST_PICKUP_DEBOUNCE_MS}ms debounce)`;
      } else if (answeredBy.startsWith("machine_end") || answeredBy === "fax") {
        amdResult = "voicemail";
        intendedAction = `voicemail_drop_play_mp3 (AMD=${answeredBy})`;
      } else if (answeredBy === "machine_start" || answeredBy === "machine") {
        amdResult = "unknown";
        connectVapi = false;
        intendedAction = `wait_for_machine_end_before_vm_drop (AMD=${answeredBy})`;
      } else if (answeredBy === "unknown") {
        amdResult = "unknown";
        connectVapi = false;
        intendedAction = "hold_silent (AMD inconclusive — no confirmed human speech)";
      } else {
        intendedAction = `hold_silent (no confirmed human speech: AnsweredBy=${answeredBy}, duration=${machineDetectionDuration || "0"}ms)`;
      }

      // Fetch settings + existing log up-front so BOTH human and voicemail branches can use them
      const [{ data: existingLog }, { data: campSettings }] = await Promise.all([
        sb.from("powerdial_call_logs").select("meta, batch_id, phone, customer_id, created_at").eq("id", callLogId).single(),
        sb.from("powerdial_campaigns").select("settings").eq("id", campaignId).single(),
      ]);

      let existingMeta = existingLog?.meta && typeof existingLog.meta === "object" && !Array.isArray(existingLog.meta)
        ? existingLog.meta as Record<string, unknown>
        : {};
      const leadPhone = (existingLog as any)?.phone || "";
      const leadCustomerId = (existingLog as any)?.customer_id || null;

      const settingsObj = {
        ...DEFAULT_POWERDIAL_SETTINGS,
        ...((campSettings?.settings || {}) as Record<string, unknown>),
      } as Record<string, unknown>;

      // Build a per-call AMD debug snapshot so the UI can show exactly what
      // happened during voicemail detection.
      const nowIso = new Date().toISOString();
      const greetingStartIso = (existingLog as any)?.created_at || nowIso;
      const beepDetectedIso = answeredBy === "machine_end_beep" ? nowIso : null;
      const machineEndIso = answeredBy.startsWith("machine_end") ? nowIso : null;
      const amdDebug = {
        answered_by: answeredBy,
        amd_result: amdResult,
        intended_action: intendedAction,
        machine_detection_duration_ms: machineDetectionDuration ? Number(machineDetectionDuration) : null,
        ai_enabled: aiEnabledForAmd,
        timestamps: {
          greeting_start: greetingStartIso,
          amd_received: nowIso,
          beep_detected: beepDetectedIso,
          machine_end: machineEndIso,
        },
        call_sid: callSid,
        call_status_at_amd: callStatus,
      };

      existingMeta = appendVmdTimeline(existingMeta, "amd_classified", {
        call_sid: callSid || null,
        answered_by: answeredBy,
        amd_result: amdResult,
        intended_action: intendedAction,
        machine_detection_duration_ms: machineDetectionDuration ? Number(machineDetectionDuration) : null,
      });

      await sb.from("powerdial_call_logs").update({
        amd_result: amdResult,
        meta: { ...existingMeta, amd_debug: amdDebug },
      }).eq("id", callLogId);

      // refresh existingMeta locally so downstream branches include amd_debug
      (existingMeta as any).amd_debug = amdDebug;

      if (connectVapi) {
        // ===== VOICEMAIL-DROP-ONLY MODE =====
        // Sole goal of this campaign is to drop voicemails. When a human
        // answers, we hang up immediately and bump a per-lead human_pickup
        // counter. After 2 human pickups, the lead is removed from the queue;
        // otherwise it is requeued (status="pending") so the next dial cycle
        // can try again — hopefully landing in their voicemail box next time.
        const vmDropOnly = (settingsObj as any).voicemail_drop_only === true;
        if (vmDropOnly) {
          // Force-hang the live call so the human doesn't stay on the line.
          try {
            await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`,
              {
                method: "POST",
                headers: {
                  Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({ Status: "completed" }).toString(),
              },
            );
          } catch (err) {
            console.error("[powerdial-webhook] vm-drop-only hangup failed:", err);
          }

          // Increment per-lead human-pickup counter atomically.
          let pickupCount = 1;
          try {
            const { data: q } = await sb
              .from("powerdial_queue")
              .select("human_pickup_count")
              .eq("id", queueItemId)
              .single();
            pickupCount = Number((q as any)?.human_pickup_count || 0) + 1;
            await sb.from("powerdial_queue").update({ human_pickup_count: pickupCount }).eq("id", queueItemId);
          } catch (err) {
            console.error("[powerdial-webhook] vm-drop-only counter update failed:", err);
          }

          const removed = pickupCount >= 2;
          await updateQueueStatusOnce(queueItemId, removed
            ? { status: "completed", last_result: "vm_drop_only_removed_after_2_pickups" }
            : { status: "pending", last_result: "vm_drop_only_human_requeued" });

          await sb.from("powerdial_call_logs").update({
            connected_to_vapi: false,
            disposition: removed ? "vm_drop_only_removed" : "vm_drop_only_requeued",
            meta: {
              ...existingMeta,
              vm_drop_only: true,
              human_pickup_count: pickupCount,
              removed_from_queue: removed,
            },
          }).eq("id", callLogId);

          await advanceCampaign(campaignId, "[powerdial-webhook]");
          return json({
            ok: true,
            mode: "voicemail_drop_only",
            human_pickup_count: pickupCount,
            removed_from_queue: removed,
          });
        }

        const queueProcessed = await updateQueueStatusOnce(queueItemId, {
          status: "completed",
          last_result: "human_connected",
        });

        if (queueProcessed) {
          await bumpCampaignCount(campaignId, "human_count");
        }

        // If this is a triple-dial batch, cancel the sibling calls
        const batchId = (existingLog as any)?.batch_id;
        if (batchId) {
          console.log(`[powerdial-webhook] Human detected in triple-dial batch ${batchId}, cancelling siblings`);
          await cancelSiblingCalls(batchId, callLogId, campaignId);
        }

        // The initial TwiML can now bridge the lead immediately on answer so
        // Vapi / AI Assist responds to the first "hello". When that path was
        // used, AMD is only a classifier/counting signal — do not redirect the
        // already-bridged live call a second time.
        if ((existingMeta as any).immediate_answer_twiml === true) {
          return json({
            ok: true,
            amd_result: amdResult,
            immediate_answer: true,
            mode: (existingMeta as any).immediate_answer_mode || "unknown",
          });
        }

        const aiEnabled = settingsObj.ai_enabled !== false; // default true
        const humanTransferPhoneRaw = typeof settingsObj.human_transfer_phone === "string"
          ? settingsObj.human_transfer_phone
          : "";
        const humanTransferPhone = normalizePhone(humanTransferPhoneRaw);

        // ===== AI DISABLED: forward call to live human transfer number =====
        if (!aiEnabled) {
          if (!humanTransferPhone) {
            console.error("[powerdial-webhook] AI disabled but no human_transfer_phone configured");
            await sb.from("powerdial_call_logs").update({
              connected_to_vapi: false,
              meta: {
                ...existingMeta,
                transfer_method: "live_transfer_failed",
                transfer_error: "no_human_transfer_phone_configured",
                ai_enabled: false,
              },
            }).eq("id", callLogId);
            // Recover queue so campaign keeps moving
            await updateQueueStatusOnce(queueItemId, {
              status: "completed",
              last_result: "no_human_transfer_phone",
            });
            await advanceCampaign(campaignId, "[powerdial-webhook]");
            return json({ ok: false, amd_result: amdResult, error: "no_human_transfer_phone_configured" });
          }

          const redirected = await redirectCallToVapi(callSid, humanTransferPhone, "live-human-transfer", {
            campaignId,
            queueItemId,
            callLogId,
            twilioFrom,
          });

          await sb.from("powerdial_call_logs").update({
            connected_to_vapi: false,
            disposition: redirected ? "transferred_to_human" : null,
            meta: {
              ...existingMeta,
              transfer_method: "live_human_transfer",
              ai_enabled: false,
              human_transfer_phone: humanTransferPhone,
              twilio_from: normalizePhone(twilioFrom) || null,
            },
          }).eq("id", callLogId);

          if (!redirected) {
            console.error(`[powerdial-webhook] Failed to transfer human call to ${humanTransferPhone}`);
            // Recover so the queue advances instead of stalling on a stuck row.
            await sb.from("powerdial_call_logs").update({
              twilio_status: "completed",
              connected_to_vapi: false,
            }).eq("id", callLogId);
            await updateQueueStatusOnce(queueItemId, {
              status: "completed",
              last_result: "transfer_failed_hangup",
            });
            await advanceCampaign(campaignId, "[powerdial-webhook]");
          } else {
            console.log(`[powerdial-webhook] Live transferred call ${callSid} → ${humanTransferPhone}`);
            // Fire follow-up SMS to the lead now that they're connected to the agent
            const smsEnabled = settingsObj.sms_after_transfer === true;
            const smsMessage = (typeof settingsObj.sms_after_transfer_message === "string" && settingsObj.sms_after_transfer_message.trim())
              ? settingsObj.sms_after_transfer_message.trim()
              : DEFAULT_SMS_AFTER_TRANSFER;
            if (smsEnabled && leadPhone && smsMessage) {
              await sendTransferSms({ leadPhone, message: smsMessage, campaignId, callLogId, customerId: leadCustomerId, sequenceId: optionalString(settingsObj.sms_sequence_id) });
            }
          }

          return json({ ok: true, amd_result: amdResult, redirected, mode: "live_human_transfer", to: humanTransferPhone });
        }

        // ===== AI ASSIST: keep this inside Vapi =====
        // PowerDial AI Assist must go through the configured Vapi assistant so
        // it waits for the lead's hello, says the handoff line, then uses its
        // Vapi transfer tool. Do not direct-bridge here or the assistant won't
        // speak and carrier prompts can leak into the experience.
        const aiAssistEnabled = settingsObj.ai_assist !== false;
        const aiAssistGreetingRaw = typeof settingsObj.ai_assist_greeting === "string"
          ? settingsObj.ai_assist_greeting
          : "";

        if (settingsObj.ai_assist_twilio_direct === true && aiAssistEnabled && humanTransferPhone) {
          const redirected = await redirectCallToAIAssistTransfer(
            callSid,
            humanTransferPhone,
            aiAssistGreetingRaw,
            { campaignId, queueItemId, callLogId, twilioFrom, answeredBy },
          );

          await sb.from("powerdial_call_logs").update({
            connected_to_vapi: false,
            disposition: redirected ? "transferred_to_human" : null,
            meta: {
              ...existingMeta,
              transfer_method: "ai_assist_warm_handoff",
              ai_enabled: true,
              ai_assist: true,
              ai_assist_greeting: aiAssistGreetingRaw || (answeredBy === "human" ? SHORT_AI_ASSIST_GREETING : DEFAULT_AI_ASSIST_GREETING),
              ai_assist_greeting_variant: aiAssistGreetingRaw
                ? "custom"
                : (answeredBy === "human" ? "short" : "default"),
              human_transfer_phone: humanTransferPhone,
              twilio_from: normalizePhone(twilioFrom) || null,
            },
          }).eq("id", callLogId);

          if (!redirected) {
            console.error(`[powerdial-webhook] AI Assist warm handoff failed for ${humanTransferPhone}`);
            // Lead likely hung up before redirect — mark call terminated and
            // advance the campaign so the queue doesn't stall forever.
            await sb.from("powerdial_call_logs").update({
              twilio_status: "completed",
              connected_to_vapi: false,
            }).eq("id", callLogId);
            await updateQueueStatusOnce(queueItemId, {
              status: "completed",
              last_result: "transfer_failed_hangup",
            });
            const advanceResult = await advanceCampaign(campaignId, "[powerdial-webhook]");
            console.log(`[powerdial-webhook] Advance after AI Assist failure for ${campaignId}:`, advanceResult);
          } else {
            const smsEnabled = settingsObj.sms_after_transfer === true;
            const smsMessage = (typeof settingsObj.sms_after_transfer_message === "string" && settingsObj.sms_after_transfer_message.trim())
              ? settingsObj.sms_after_transfer_message.trim()
              : DEFAULT_SMS_AFTER_TRANSFER;
            if (smsEnabled && leadPhone && smsMessage) {
              await sendTransferSms({ leadPhone, message: smsMessage, campaignId, callLogId, customerId: leadCustomerId, sequenceId: optionalString(settingsObj.sms_sequence_id) });
            }
          }

          return json({
            ok: true,
            amd_result: amdResult,
            redirected,
            mode: "ai_assist_warm_handoff",
            to: humanTransferPhone,
          });
        }

        // ===== AI ENABLED: existing Vapi flow =====
        // The assistant_id was frozen in call log meta at dial time by placeCall()
        const frozenAssistantId = typeof existingMeta.assistant_id === "string"
          ? existingMeta.assistant_id.trim()
          : "";

        // Always sanitize to ensure we never use an inbound assistant
        const assistantId = sanitizePowerDialAssistantId(
          frozenAssistantId || resolvePowerDialAssistantId(settingsObj),
        );

        console.log(`[powerdial-webhook] Resolved outbound assistant: ${assistantId} (frozen=${frozenAssistantId}, campaign=${(settingsObj as any)?.vapi_assistant_id || 'none'})`);

        // PATCH the Vapi phone number to use the correct outbound assistant BEFORE redirect
        const assistantPreparation = await prepareVapiOutboundAssistant(assistantId, humanTransferPhone);
        console.log(`[powerdial-webhook] Vapi assistant prep: ok=${assistantPreparation.ok}, current=${assistantPreparation.currentAssistantId}, target=${assistantId}`);

        const vapiPhoneNumber = assistantPreparation.phoneNumber || await getVapiPhoneNumber(VAPI_PHONE_NUMBER_ID);
        const redirected = vapiPhoneNumber
          ? await redirectCallToVapi(callSid, vapiPhoneNumber, assistantId, {
              campaignId,
              queueItemId,
              callLogId,
              twilioFrom,
            })
          : false;

        await sb.from("powerdial_call_logs").update({
          connected_to_vapi: redirected,
          meta: {
            ...existingMeta,
            transfer_method: "twilio_redirect",
            assistant_id: assistantId,
            assistant_source: frozenAssistantId ? "call_log_frozen" : "campaign_settings",
            assistant_prepare_ok: assistantPreparation.ok,
            assistant_prepare_error: assistantPreparation.details,
            vapi_phone: vapiPhoneNumber,
            ...(assistantPreparation.currentAssistantId ? { vapi_phone_assistant_id: assistantPreparation.currentAssistantId } : {}),
            twilio_from: normalizePhone(twilioFrom) || null,
            ai_enabled: true,
          },
        }).eq("id", callLogId);

        if (!redirected) {
          console.error("[powerdial-webhook] Failed to redirect human call to Vapi");

          // ===== AUTO-FALLBACK: if Vapi setup fails (e.g., expired phone-number-id),
          // gracefully fall through to AI Assist warm hand-off so the lead never
          // hears dead silence. Requires a configured human_transfer_phone.
          if (humanTransferPhone) {
            console.log(`[powerdial-webhook] Vapi failed — falling back to AI Assist warm handoff for ${humanTransferPhone}`);
            const fallbackOk = await redirectCallToAIAssistTransfer(
              callSid,
              humanTransferPhone,
              aiAssistGreetingRaw,
              { campaignId, queueItemId, callLogId, twilioFrom, answeredBy },
            );

            await sb.from("powerdial_call_logs").update({
              connected_to_vapi: false,
              disposition: fallbackOk ? "transferred_to_human" : null,
              meta: {
                ...existingMeta,
                transfer_method: "ai_assist_warm_handoff_fallback",
                fallback_reason: "vapi_redirect_failed",
                ai_enabled: true,
                ai_assist: true,
                ai_assist_greeting: aiAssistGreetingRaw || (answeredBy === "human" ? SHORT_AI_ASSIST_GREETING : DEFAULT_AI_ASSIST_GREETING),
                ai_assist_greeting_variant: aiAssistGreetingRaw
                  ? "custom"
                  : (answeredBy === "human" ? "short" : "default"),
                human_transfer_phone: humanTransferPhone,
                vapi_phone: vapiPhoneNumber,
                twilio_from: normalizePhone(twilioFrom) || null,
              },
            }).eq("id", callLogId);

            if (fallbackOk) {
              const smsEnabled = settingsObj.sms_after_transfer === true;
              const smsMessage = (typeof settingsObj.sms_after_transfer_message === "string" && settingsObj.sms_after_transfer_message.trim())
                ? settingsObj.sms_after_transfer_message.trim()
                : DEFAULT_SMS_AFTER_TRANSFER;
              if (smsEnabled && leadPhone && smsMessage) {
                await sendTransferSms({ leadPhone, message: smsMessage, campaignId, callLogId, customerId: leadCustomerId, sequenceId: optionalString(settingsObj.sms_sequence_id) });
              }
            } else {
              // Both Vapi AND warm-handoff fallback failed — recover queue.
              await sb.from("powerdial_call_logs").update({
                twilio_status: "completed",
                connected_to_vapi: false,
              }).eq("id", callLogId);
              await updateQueueStatusOnce(queueItemId, {
                status: "completed",
                last_result: "transfer_failed_hangup",
              });
              await advanceCampaign(campaignId, "[powerdial-webhook]");
            }

            return json({
              ok: true,
              amd_result: amdResult,
              redirected: fallbackOk,
              mode: "ai_assist_warm_handoff_fallback",
              to: humanTransferPhone,
            });
          }

          // Vapi failed AND no human-transfer fallback configured — recover
          // the queue so the campaign keeps moving instead of stalling.
          await sb.from("powerdial_call_logs").update({
            twilio_status: "completed",
            connected_to_vapi: false,
          }).eq("id", callLogId);
          await updateQueueStatusOnce(queueItemId, {
            status: "completed",
            last_result: "vapi_redirect_failed",
          });
          const advanceResult = await advanceCampaign(campaignId, "[powerdial-webhook]");
          console.log(`[powerdial-webhook] Advance after Vapi-no-fallback failure for ${campaignId}:`, advanceResult);
        }

        return json({ ok: true, amd_result: amdResult, redirected, assistant_id: assistantId });
      }

      if (amdResult !== "voicemail") {
        console.log(`[powerdial-webhook] Speech gate holding silent for call ${callSid}: ${intendedAction}`);
        await sb.from("powerdial_call_logs").update({
          connected_to_vapi: false,
          meta: {
            ...existingMeta,
            speech_gate: {
              passed: false,
              answered_by: answeredBy,
              machine_detection_duration_ms: machineDetectionDuration ? Number(machineDetectionDuration) : null,
              required_audio_ms: HUMAN_SPEECH_MIN_AUDIO_MS,
              post_pickup_debounce_ms: POST_PICKUP_DEBOUNCE_MS,
              action: "hold_silent",
            },
          },
        }).eq("id", callLogId);
        return json({ ok: true, amd_result: amdResult, speech_gate_passed: false, action: "hold_silent" });
      }

      // ===== VOICEMAIL BRANCH =====
      // If campaign has voicemail-drop enabled, redirect the call to TwiML that
      // plays the configured MP3 directly into the recipient's voicemail box,
      // then hangs up. Otherwise, just hang up immediately.
      const vmDropEnabled = settingsObj.voicemail_drop_enabled !== false; // ON by default
      const rawConfiguredVmDropUrl = (typeof settingsObj.voicemail_drop_url === "string" && settingsObj.voicemail_drop_url.trim())
        ? settingsObj.voicemail_drop_url.trim()
        : null;
      const configuredVmDropUrl = isLegacyDefaultVoicemailUrl(rawConfiguredVmDropUrl) ? null : rawConfiguredVmDropUrl;
      let vmDropUrl = configuredVmDropUrl
        || "https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/powerdial-voicemail-audio?file=warren";

      // Prefer the active recording from voicemail_recordings (admin-managed).
      let pauseBeforeSec = 1;
      let pauseAfterSec = 0;
      let ttsFallbackText: string | null = null;
      let selectedRecording: Record<string, unknown> | null = null;
      try {
        const { data: activeRecs } = await sb
          .from("voicemail_recordings")
          .select("id, name, storage_path, is_active, pause_before_sec, pause_after_sec, tts_fallback_text, updated_at, created_at")
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(5);
        const activeRec = activeRecs?.[0];
        if (!configuredVmDropUrl && activeRec?.id) {
          // Cache-bust on updated_at so re-uploads / new actives are not served
          // from Twilio's edge cache of a prior recording.
          const ver = encodeURIComponent(String(activeRec.updated_at || activeRec.created_at || Date.now()));
          vmDropUrl = `${SUPABASE_URL}/functions/v1/powerdial-voicemail-audio?id=${activeRec.id}&v=${ver}`;
          pauseBeforeSec = Number(activeRec.pause_before_sec ?? 2);
          pauseAfterSec = Number(activeRec.pause_after_sec ?? 1);
          ttsFallbackText = activeRec.tts_fallback_text || null;
          selectedRecording = activeRec as Record<string, unknown>;
        }
        existingMeta = appendVmdTimeline(existingMeta, "active_recording_check", {
          configured_url: rawConfiguredVmDropUrl,
          configured_url_ignored_as_legacy_default: Boolean(rawConfiguredVmDropUrl && !configuredVmDropUrl),
          active_recording_count: activeRecs?.length || 0,
          active_recordings: (activeRecs || []).map((rec: any) => ({ id: rec.id, name: rec.name, updated_at: rec.updated_at })),
          selected_recording_id: activeRec?.id || null,
          selected_recording_name: activeRec?.name || null,
          selected_recording_path: activeRec?.storage_path || null,
          playback_url: vmDropUrl,
        });
      } catch (err) {
        existingMeta = appendVmdTimeline(existingMeta, "active_recording_check_failed", { error: String(err), fallback_url: vmDropUrl });
      }

      let vmDropped = false;
      const vmDropClaimed = await claimVoicemailDrop(callLogId);
      if (!vmDropClaimed) {
        console.warn(`[powerdial-webhook] Duplicate voicemail AMD ignored for call ${callLogId || callSid}`);
        await logVmdTimeline(callLogId, "voicemail_drop_duplicate_ignored", { call_sid: callSid || null });
        return json({ ok: true, amd_result: amdResult, vm_dropped: false, duplicate: true });
      }

      if (vmDropEnabled && vmDropUrl) {
        try {
          const isAfterMessageEnd = answeredBy.startsWith("machine_end");
          const leadInPause = isAfterMessageEnd ? "" : `<Pause length="${Math.max(1, pauseBeforeSec)}"/>`;
          const tailPause = `<Pause length="${Math.max(0, pauseAfterSec)}"/>`;
          const ttsFallback = ttsFallbackText
            ? `<Say voice="Polly.Joanna" language="en-US">${escapeXml(ttsFallbackText)}</Say>`
            : "";
          const vmTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response>${leadInPause}<Play>${escapeXml(vmDropUrl)}</Play>${tailPause}${ttsFallback}<Hangup/></Response>`;
          existingMeta = appendVmdTimeline(existingMeta, "voicemail_drop_redirect_attempt", {
            call_sid: callSid || null,
            answered_by: answeredBy,
            pause_before_sec: isAfterMessageEnd ? 0 : Math.max(1, pauseBeforeSec),
            pause_after_sec: pauseAfterSec,
            playback_url: vmDropUrl,
            selected_recording_id: selectedRecording?.id || null,
            selected_recording_name: selectedRecording?.name || null,
          });
          const redirectResp = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({ Twiml: vmTwiml }).toString(),
            },
          );
          if (redirectResp.ok) {
            vmDropped = true;
            await sb.from("powerdial_call_logs").update({ voicemail_drop_completed_at: new Date().toISOString() }).eq("id", callLogId);
            console.log(`[powerdial-webhook] Voicemail drop sent for call ${callSid}: ${vmDropUrl}`);
            existingMeta = appendVmdTimeline(existingMeta, "voicemail_drop_redirect_success", {
              call_sid: callSid || null,
              playback_url: vmDropUrl,
              selected_recording_id: selectedRecording?.id || null,
              selected_recording_name: selectedRecording?.name || null,
            });
          } else {
            const errText = await redirectResp.text();
            console.error(`[powerdial-webhook] Voicemail drop redirect failed:`, errText);
            existingMeta = appendVmdTimeline(existingMeta, "voicemail_drop_redirect_failed", {
              call_sid: callSid || null,
              status: redirectResp.status,
              error: errText.slice(0, 500),
            });
          }
        } catch (err) {
          console.error("[powerdial-webhook] Voicemail drop exception:", err);
          existingMeta = appendVmdTimeline(existingMeta, "voicemail_drop_exception", { error: String(err) });
        }
      }

      if (!vmDropped) {
        // Fallback: hang up immediately
        try {
          existingMeta = appendVmdTimeline(existingMeta, "voicemail_drop_fallback_hangup", {
            call_sid: callSid || null,
            reason: "drop_not_confirmed",
          });
          await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({ Status: "completed" }).toString(),
            },
          );
        } catch (err) {
          console.error("[powerdial-webhook] Failed to force-complete voicemail call:", err);
        }
      }

      const queueProcessed = await updateQueueStatusOnce(queueItemId, {
        status: "completed",
        last_result: vmDropped ? "voicemail_dropped" : "voicemail",
      });

      if (queueProcessed) {
        await bumpCampaignCount(campaignId, "voicemail_count");
      }
      existingMeta = appendVmdTimeline(existingMeta, "queue_transition", {
        queue_item_id: queueItemId,
        queue_updated: queueProcessed,
        status: "completed",
        last_result: vmDropped ? "voicemail_dropped" : "voicemail",
      });

      // Mark the call log with VM drop status
      const vmDropTs = new Date().toISOString();
      const prevAmdDebug = (existingMeta as any).amd_debug && typeof (existingMeta as any).amd_debug === "object"
        ? (existingMeta as any).amd_debug as Record<string, unknown>
        : {};
      await sb.from("powerdial_call_logs").update({
        meta: {
          ...existingMeta,
          voicemail_dropped: vmDropped,
          voicemail_drop_url: vmDropped ? vmDropUrl : null,
          amd_debug: {
            ...prevAmdDebug,
            voicemail_drop: {
              attempted: vmDropEnabled,
              succeeded: vmDropped,
              url: vmDropUrl,
              dropped_at: vmDropped ? vmDropTs : null,
              selected_recording_id: selectedRecording?.id || null,
              selected_recording_name: selectedRecording?.name || null,
            },
          },
        },
      }).eq("id", callLogId);

      const advanceResult = await advanceCampaign(campaignId, "[powerdial-webhook]");
      console.log(`[powerdial-webhook] Advance after voicemail (dropped=${vmDropped}) for ${campaignId}:`, advanceResult);

      // VOICEMAIL DROP TEXT — send the configured SMS from VoidFix to the same recipient
      if (vmDropped && leadPhone) {
        const vmSmsEnabled = settingsObj.voicemail_drop_sms_enabled === true; // default OFF (auto-text removed)
        const vmSmsText = (typeof settingsObj.voicemail_drop_sms_text === "string" && settingsObj.voicemail_drop_sms_text.trim())
          ? settingsObj.voicemail_drop_sms_text.trim()
          : DEFAULT_VOICEMAIL_DROP_SMS;
        if (vmSmsEnabled && vmSmsText) {
          // Do not depend on the call-log tracking columns before sending: older
          // function instances can have a stale schema cache and falsely block the
          // VoidFix send. The powerdial-sms endpoint + communications unique index
          // are the source of truth for duplicate protection per call_log_id.
          const smsResult = await sendVoicemailDropSms({
            leadPhone,
            message: vmSmsText,
            campaignId,
            callLogId,
            customerId: leadCustomerId,
            voicemailDropUrl: vmDropUrl,
          });
          await markVoicemailDropSms(callLogId, smsResult.ok, smsResult.error);
        }
      }

      return json({ ok: true, amd_result: amdResult, vm_dropped: vmDropped, advanced: advanceResult });
    }

    if (type === "dial-complete") {
      const dialCallStatus = params.get("DialCallStatus") || params.get("CallStatus") || "completed";
      console.log(`[powerdial-webhook] Dial complete: ${dialCallStatus} for call ${callSid}`);

      await sb.from("powerdial_call_logs").update({
        twilio_status: dialCallStatus,
      }).eq("id", callLogId);

      // Auto-reply SMS for human-connected dropped calls
      if (dialCallStatus === "completed" || dialCallStatus === "no-answer") {
        try {
          const { data: qItem } = await sb
            .from("powerdial_queue")
            .select("phone, customer_id")
            .eq("id", queueItemId)
            .single();
          const leadPhone = qItem?.phone || params.get("To") || "";
          if (leadPhone && SUPABASE_SERVICE_ROLE_KEY) {
            const AUTO_REPLY_BODY = "Hi this is Warren, AI Videographer / Director, Busy in a meeting, will call you back, can I send you my IG reel in the mean time?";
            await fetch(`${SUPABASE_URL}/functions/v1/powerdial-sms`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                action: "send",
                to: normalizePhone(leadPhone),
                body: AUTO_REPLY_BODY,
                customer_id: qItem?.customer_id || null,
                source: "powerdial-dropped-call-sms",
                metadata: {
                  source: "powerdial-dropped-call-sms",
                  campaign_id: campaignId,
                  call_log_id: callLogId,
                  dial_call_status: dialCallStatus,
                  trigger: "human_call_dropped",
                },
              }),
            }).catch((err) => console.error("[powerdial-webhook] dropped-call auto-reply failed:", err));
          }
        } catch (err) {
          console.error("[powerdial-webhook] dropped-call auto-reply exception:", err);
        }
      }

      const advanceResult = await handleCallCompletion(campaignId, queueItemId, callLogId, "dial-complete");
      return json({ ok: true, source: "dial-complete", dial_call_status: dialCallStatus, advanced: advanceResult });
    }

    if (type === "status") {
      console.log(`[powerdial-webhook] Status: ${callStatus} for call ${callSid}`);
      await sb.from("powerdial_call_logs").update({ twilio_status: callStatus }).eq("id", callLogId);

      if (callStatus === "busy") {
        const queueProcessed = await updateQueueStatusOnce(queueItemId, {
          status: "completed",
          last_result: "busy",
        });

        if (queueProcessed) {
          await bumpCampaignCount(campaignId, "busy_count");
          await sb.from("powerdial_call_logs").update({ amd_result: "busy" }).eq("id", callLogId);
        }

        const advanceResult = await advanceCampaign(campaignId, "[powerdial-webhook]");
        console.log(`[powerdial-webhook] Advance after busy for ${campaignId}:`, advanceResult);
      } else if (callStatus === "no-answer") {
        const [{ data: qItem }, { data: campaign }] = await Promise.all([
          sb.from("powerdial_queue").select("retry_count, phone").eq("id", queueItemId).single(),
          sb.from("powerdial_campaigns").select("settings").eq("id", campaignId).single(),
        ]);

        const maxRetries = Number((campaign?.settings as any)?.max_retries || 2);
        const retryHours = Number((campaign?.settings as any)?.retry_no_answer_hours || 4);
        const currentRetryCount = Number(qItem?.retry_count || 0);
        const willRetry = currentRetryCount < maxRetries;

        const queueProcessed = await updateQueueStatusOnce(queueItemId, willRetry
          ? {
              status: "retry_later",
              last_result: "no_answer",
              retry_count: currentRetryCount + 1,
              retry_at: new Date(Date.now() + retryHours * 3600000).toISOString(),
            }
          : {
              status: "completed",
              last_result: "no_answer",
            });

        if (queueProcessed) {
          await sb.from("powerdial_call_logs").update({
            amd_result: "no_answer",
            retry_eligible: willRetry,
          }).eq("id", callLogId);
          await bumpCampaignCount(campaignId, "no_answer_count");

          // Auto-register in DNC registry after max attempts exhausted
          if (!willRetry && qItem?.phone) {
            const totalAttempts = currentRetryCount + 1;
            await sb.from("lh_dnc_registry").upsert({
              phone: qItem.phone,
              reason: "max_attempts",
              call_count: totalAttempts,
              last_called_at: new Date().toISOString(),
              source_list_id: null,
            }, { onConflict: "phone" });
            console.log(`[powerdial-webhook] DNC registered: ${qItem.phone} after ${totalAttempts} attempts`);
          }
        }

        const advanceResult = await advanceCampaign(campaignId, "[powerdial-webhook]");
        console.log(`[powerdial-webhook] Advance after no-answer for ${campaignId}:`, advanceResult);
    } else if (callStatus === "failed" || callStatus === "canceled") {
        // Check if this is a cancelled triple-dial sibling — if so, skip everything
        const { data: logCheck } = await sb.from("powerdial_call_logs")
          .select("amd_result, batch_id")
          .eq("id", callLogId)
          .single();

        const isTripleDialCancelled = logCheck?.amd_result === "cancelled_triple_dial";

        if (!isTripleDialCancelled) {
          const queueProcessed = await updateQueueStatusOnce(queueItemId, {
            status: "completed",
            last_result: "failed",
          });

          if (queueProcessed) {
            await sb.from("powerdial_call_logs").update({
              amd_result: "failed",
              twilio_status: callStatus,
            }).eq("id", callLogId);
            await bumpCampaignCount(campaignId, "failed_count");
          }

          const advanceResult = await advanceCampaign(campaignId, "[powerdial-webhook]");
          console.log(`[powerdial-webhook] Advance after failed/canceled for ${campaignId}:`, advanceResult);
        } else {
          console.log(`[powerdial-webhook] Skipping status update for triple-dial cancelled sibling ${callLogId}`);
          // Ensure queue item stays pending (safety net against race conditions)
          await sb.from("powerdial_queue").update({
            status: "pending",
            last_result: null,
          }).eq("id", queueItemId).in("status", ["dialing", "completed"]);
        }
      } else if (callStatus === "completed") {
        await handleCallCompletion(campaignId, queueItemId, callLogId, "status");
      }

      return json({ ok: true });
    }

    return json({ error: "unknown type" }, 400);
  } catch (err) {
    console.error("[powerdial-webhook]", err);
    return json({ error: String(err) }, 500);
  }
});
