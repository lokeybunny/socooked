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
  "Hi, I'm calling you in regards to one of your property listings... Can I transfer you over to Warren?";

// Snappier greeting used when AMD reports a confident, fast human answer
// (Twilio AnsweredBy === "human"). Shaves ~2s of audio off the first words.
const SHORT_AI_ASSIST_GREETING =
  "Hi! Quick call about your property listing... connecting you to Warren now.";

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
async function buildAIGreetingUrl(voiceId: string, greetingText: string): Promise<string> {
  const hash = await fingerprintGreeting(voiceId, greetingText);
  // Pre-warm cache so the audio request doesn't have to wait on TTS round-trip
  // (Twilio will fetch it within ~200ms).
  await generateElevenLabsGreetingBytes(voiceId, greetingText);

  const url = new URL(`${SUPABASE_URL}/functions/v1/powerdial-webhook`);
  url.searchParams.set("type", "ai-greeting");
  url.searchParams.set("voice", voiceId);
  url.searchParams.set("hash", hash);
  url.searchParams.set("text", greetingText);
  return url.toString();
}

/**
 * AI Assist warm-handoff: Twilio plays a short stalling greeting to the lead
 * (rendered via ElevenLabs in voice eXpIbVcVbLo8ZJQDlDnl, with a Polly fallback),
 * then silently bridges them to the live human agent. Because we use
 * answerOnBridge="false", the lead never hears ringing — the agent just
 * appears on the line right after the greeting finishes.
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

    // Adaptive greeting: if AMD is highly confident the lead just said "hello"
    // (AnsweredBy === "human"), use the shorter greeting to start speaking ~2s
    // sooner. Otherwise use the user-configured / default greeting.
    const customGreeting = greetingText && greetingText.trim();
    const sayText = customGreeting
      ? customGreeting
      : (options.answeredBy === "human"
        ? SHORT_AI_ASSIST_GREETING
        : DEFAULT_AI_ASSIST_GREETING);

    // Try ElevenLabs first; gracefully fall back to Polly.Joanna-Neural <Say>
    // so the warm hand-off never breaks even if ElevenLabs is down.
    // Try ElevenLabs first; gracefully fall back to Polly.Joanna-Neural <Say>
    // so the warm hand-off never breaks even if ElevenLabs is down.
    // Audio is streamed inline from this same edge function — no storage bucket needed.
    const elevenBytes = await generateElevenLabsGreetingBytes(
      AI_ASSIST_ELEVENLABS_VOICE_ID,
      sayText,
    );
    const elevenUrl = elevenBytes
      ? await buildAIGreetingUrl(AI_ASSIST_ELEVENLABS_VOICE_ID, sayText)
      : null;

    const greetingTwiml = elevenUrl
      ? `<Play>${escapeXml(elevenUrl)}</Play>`
      : `<Say voice="Polly.Joanna-Neural">${escapeXml(sayText)}</Say>`;

    // Sequence: AI voice greets the lead → short pause (gives agent time to
    // be bridged silently) → silent dial bridges the human in.
    // answerOnBridge="false" ensures NO ringback is audible to the lead.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingTwiml}
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
      `[powerdial-webhook] AI Assist warm handoff: ${callSid} → ${elevenUrl ? "ElevenLabs" : "Polly fallback"} + bridge ${humanTransferPhone}`,
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
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="30"/>
  <Say>Thank you for your time. Goodbye.</Say>
  <Hangup/>
</Response>`;
      return twimlResponse(xml);
    }

    const formText = await req.text();
    const params = new URLSearchParams(formText);
    const callSid = params.get("CallSid") || "";
    const callStatus = params.get("CallStatus") || "";
    const twilioFrom = params.get("From") || "";

    if (type === "amd") {
      const answeredBy = params.get("AnsweredBy") || "";
      console.log(`[powerdial-webhook] AMD result: ${answeredBy} for call ${callSid}`);

      // Check if AI is disabled — if so, we bypass AMD entirely and bridge any answer to the human
      const { data: campSettingsForAmd } = await sb
        .from("powerdial_campaigns")
        .select("settings")
        .eq("id", campaignId)
        .single();
      const aiEnabledForAmd = (campSettingsForAmd?.settings as any)?.ai_enabled !== false;

      let amdResult = "unknown";
      let connectVapi = false;

      if (!aiEnabledForAmd) {
        // AI off: any answered call should ring the human transfer number.
        // AMD is unreliable when bridging to a real person — skip it.
        amdResult = "human";
        connectVapi = true;
        console.log(`[powerdial-webhook] AI disabled — forcing human-transfer path regardless of AMD result (${answeredBy})`);
      } else if (answeredBy === "human") {
        amdResult = "human";
        connectVapi = true;
      } else if (answeredBy.includes("machine") || answeredBy === "fax") {
        amdResult = "voicemail";
      } else if (answeredBy === "unknown") {
        amdResult = "human";
        connectVapi = true;
      }

      await sb.from("powerdial_call_logs").update({ amd_result: amdResult }).eq("id", callLogId);

      if (connectVapi) {
        const queueProcessed = await updateQueueStatusOnce(queueItemId, {
          status: "completed",
          last_result: "human_connected",
        });

        if (queueProcessed) {
          await bumpCampaignCount(campaignId, "human_count");
        }

        // Get frozen assistant from call log meta (set at dial time), fallback to campaign settings
        const [{ data: existingLog }, { data: campSettings }] = await Promise.all([
          sb.from("powerdial_call_logs").select("meta, batch_id").eq("id", callLogId).single(),
          sb.from("powerdial_campaigns").select("settings").eq("id", campaignId).single(),
        ]);

        // If this is a triple-dial batch, cancel the sibling calls
        const batchId = (existingLog as any)?.batch_id;
        if (batchId) {
          console.log(`[powerdial-webhook] Human detected in triple-dial batch ${batchId}, cancelling siblings`);
          await cancelSiblingCalls(batchId, callLogId, campaignId);
        }

        const existingMeta = existingLog?.meta && typeof existingLog.meta === "object" && !Array.isArray(existingLog.meta)
          ? existingLog.meta as Record<string, unknown>
          : {};

        const settingsObj = {
          ...DEFAULT_POWERDIAL_SETTINGS,
          ...((campSettings?.settings || {}) as Record<string, unknown>),
        } as Record<string, unknown>;
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
          } else {
            console.log(`[powerdial-webhook] Live transferred call ${callSid} → ${humanTransferPhone}`);
          }

          return json({ ok: true, amd_result: amdResult, redirected, mode: "live_human_transfer", to: humanTransferPhone });
        }

        // ===== AI ASSIST: AI greets/stalls, then silently bridge to human =====
        // When ai_assist is true and a human transfer number is configured,
        // we play a short greeting via Twilio TTS to the lead while we silently
        // bridge the live agent in — the lead never hears a ring.
        const aiAssistEnabled = settingsObj.ai_assist !== false;
        const aiAssistGreetingRaw = typeof settingsObj.ai_assist_greeting === "string"
          ? settingsObj.ai_assist_greeting
          : "";

        if (aiAssistEnabled && humanTransferPhone) {
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
        const assistantPreparation = await prepareVapiOutboundAssistant(assistantId);
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

            return json({
              ok: true,
              amd_result: amdResult,
              redirected: fallbackOk,
              mode: "ai_assist_warm_handoff_fallback",
              to: humanTransferPhone,
            });
          }
        }

        return json({ ok: true, amd_result: amdResult, redirected, assistant_id: assistantId });
      }

      // Non-human: hang up and advance
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
        console.error("[powerdial-webhook] Failed to force-complete voicemail call:", err);
      }

      const queueProcessed = await updateQueueStatusOnce(queueItemId, {
        status: "completed",
        last_result: "voicemail",
      });

      if (queueProcessed) {
        await bumpCampaignCount(campaignId, "voicemail_count");
      }

      const advanceResult = await advanceCampaign(campaignId, "[powerdial-webhook]");
      console.log(`[powerdial-webhook] Advance after voicemail for ${campaignId}:`, advanceResult);

      return json({ ok: true, amd_result: amdResult, advanced: advanceResult });
    }

    if (type === "dial-complete") {
      const dialCallStatus = params.get("DialCallStatus") || params.get("CallStatus") || "completed";
      console.log(`[powerdial-webhook] Dial complete: ${dialCallStatus} for call ${callSid}`);

      await sb.from("powerdial_call_logs").update({
        twilio_status: dialCallStatus,
      }).eq("id", callLogId);

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
