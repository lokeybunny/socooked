import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const DEFAULT_OUTBOUND_VAPI_ASSISTANT = "1eddf1f7-3ef8-4950-9a65-1fd68516208e";
// Verizon office line is the PowerDial human-transfer destination. The "press 1
// to accept" whisper is intentional and is handled by twilio-whisper — it must
// NOT be replaced with the cell line, otherwise Vapi loses its handoff target.
export const DEFAULT_POWERDIAL_HUMAN_TRANSFER_PHONE = "+17027016192";

const POWERDIAL_INBOUND_VAPI_ASSISTANTS = new Set([
  "fea7fb27-2311-4f42-9bc1-d6e6fa966ab8",
  "29ca9037-ff4c-4d56-a9c7-6c5bc1ab1b38",
]);

export const DEFAULT_POWERDIAL_SETTINGS = {
  ai_enabled: true,
  ai_assist: true,
  human_transfer_phone: DEFAULT_POWERDIAL_HUMAN_TRANSFER_PHONE,
  call_delay_ms: 2000,
  max_retries: 2,
  retry_no_answer_hours: 4,
  retry_busy_minutes: 30,
  calling_hours_start: "09:00",
  calling_hours_end: "17:00",
  vapi_assistant_id: DEFAULT_OUTBOUND_VAPI_ASSISTANT,
  voicemail_drop_enabled: true,
  voicemail_drop_url: null,
};

const POWERDIAL_AI_ASSIST_FIRST_MESSAGE =
  "Please hold while I transfer you to Warren about your property listing.";
const POWERDIAL_AI_ASSIST_SYSTEM_MARKER = "[POWERDIAL_AI_ASSIST_WARM_TRANSFER]";

export const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER") || "";
const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY") || "";
const VAPI_PHONE_NUMBER_ID = Deno.env.get("VAPI_PHONE_NUMBER_ID") || "";
const TWILIO_CALLER_ID_ERROR_CODES = new Set([21210, 21212]);

export const sb = createClient(supabaseUrl, serviceKey);

type DialNextResult = {
  dialed: boolean;
  reason?: string;
  message?: string;
  twilio_code?: number;
  from?: string | null;
};

type VapiAssistantPreparationResult = {
  ok: boolean;
  phoneNumber: string | null;
  currentAssistantId: string | null;
  details: string | null;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TERMINAL_CONNECTED_CALL_STATUSES = new Set([
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled",
]);

async function hasActiveConnectedCall(campaignId: string, excludeCallLogId?: string) {
  const { data: connectedCalls } = await sb
    .from("powerdial_call_logs")
    .select("id, twilio_status, amd_result, connected_to_vapi, created_at")
    .eq("campaign_id", campaignId)
    .or("connected_to_vapi.eq.true,amd_result.eq.human")
    .order("created_at", { ascending: false })
    .limit(10);

  const now = Date.now();
  return Boolean((connectedCalls || []).find((call: any) => {
    if (excludeCallLogId && call.id === excludeCallLogId) return false;
    // Treat any "active" call older than 90s as stale. The webhook should
    // have flipped twilio_status to a terminal state long before that, and
    // a stuck row from a redirect-failure would otherwise block all new
    // dialing forever.
    const age = now - new Date(call.created_at).getTime();
    if (age > 90 * 1000) return false;
    const status = String(call?.twilio_status || "").toLowerCase();
    return !status || !TERMINAL_CONNECTED_CALL_STATUSES.has(status);
  }));
}

async function recoverCancelledTripleDialQueue(campaignId: string) {
  // Recover items stuck in "dialing" with cancelled_triple_dial result
  const { data: stuckDialing } = await sb
    .from("powerdial_queue")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "dialing")
    .eq("last_result", "cancelled_triple_dial")
    .limit(20);

  // Also recover items stuck in "completed" with cancelled_triple_dial (race condition)
  const { data: stuckCompleted } = await sb
    .from("powerdial_queue")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "completed")
    .eq("last_result", "cancelled_triple_dial")
    .limit(20);

  const allStuck = [...(stuckDialing || []), ...(stuckCompleted || [])];
  if (!allStuck.length) return 0;

  const ids = allStuck.map((item: any) => item.id).filter(Boolean);
  if (!ids.length) return 0;

  const { data: recovered } = await sb
    .from("powerdial_queue")
    .update({
      status: "pending",
      last_result: null,
      retry_at: null,
    })
    .in("id", ids)
    .in("status", ["dialing", "completed"])
    .select("id");

  if (recovered?.length) {
    console.log(`[powerdial] Recovered ${recovered.length} cancelled_triple_dial queue items`);
  }

  return recovered?.length || 0;
}

export function normalizePhone(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (value.startsWith("+")) return value.replace(/[^\d+]/g, "");
  return `+${digits}`;
}

function extractVapiPhoneNumber(payload: any): string | null {
  return payload?.number || payload?.phoneNumber || payload?.phone_number || null;
}

function extractVapiAssistantId(payload: any): string | null {
  const assistantId = String(payload?.assistantId || payload?.assistant?.id || payload?.assistant_id || "").trim();
  return assistantId || null;
}

async function fetchVapiJson(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${VAPI_API_KEY}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`https://api.vapi.ai${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  let data: any = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { response, data };
}

export function resolvePowerDialAssistantId(settings: Record<string, unknown> | null | undefined) {
  return sanitizePowerDialAssistantId(settings?.vapi_assistant_id);
}

export function sanitizePowerDialAssistantId(value: unknown) {
  const assistantId = typeof value === "string"
    ? value.trim()
    : "";

  if (!assistantId || POWERDIAL_INBOUND_VAPI_ASSISTANTS.has(assistantId)) {
    return DEFAULT_OUTBOUND_VAPI_ASSISTANT;
  }

  return assistantId;
}

function buildPowerDialTransferTool(humanTransferPhone: string) {
  if (!humanTransferPhone) return null;

  return {
    type: "transferCall",
    function: {
      name: "transfer_to_boss",
      description: "PowerDial only: immediately warm-transfer the connected lead to Warren after the handoff line is spoken.",
    },
    destinations: [
      {
        type: "number",
        number: humanTransferPhone,
        description: "Warren's Verizon office line for PowerDial live handoffs",
        // Do not let Vapi speak an extra transfer announcement to the lead.
        message: "",
        transferPlan: {
          mode: "warm-transfer-wait-for-operator-to-speak-first-and-then-say-message",
          message: "PowerDial is connecting a live property listing lead to Warren.",
          timeout: 60,
          dialTimeout: 30,
          fallbackPlan: {
            message: "I couldn't reach him right now, but he'll follow up with you shortly.",
            endCallEnabled: true,
          },
        },
      },
    ],
    messages: [
      { type: "request-start", content: "" },
      {
        type: "request-failed",
        content: "I couldn't reach him right now, but he'll follow up with you shortly.",
        endCallAfterSpokenEnabled: true,
      },
    ],
  };
}

function mergePowerDialAssistantModel(existingModel: any, humanTransferPhone: string) {
  if (!existingModel || typeof existingModel !== "object") return undefined;

  const systemContent = `${POWERDIAL_AI_ASSIST_SYSTEM_MARKER}\nPowerDial-only behavior: wait for the lead to say hello or speak first. Then say exactly: "${POWERDIAL_AI_ASSIST_FIRST_MESSAGE}" After that line, immediately call the transfer_to_boss tool. Do not ask for first name, last name, verification, reason for calling, or permission. Do not mention recording a name. Keep this handoff path separate from regular inbound phone calls.`;
  const messages = Array.isArray(existingModel.messages) ? existingModel.messages : [];
  const nextMessages = [
    ...messages.filter((message: any) => !String(message?.content || "").includes(POWERDIAL_AI_ASSIST_SYSTEM_MARKER)),
    { role: "system", content: systemContent },
  ];

  const transferTool = buildPowerDialTransferTool(humanTransferPhone);
  const tools = Array.isArray(existingModel.tools) ? existingModel.tools : [];
  const nextTools = transferTool
    ? [
        ...tools.filter((tool: any) => (tool?.function?.name || tool?.type) !== "transfer_to_boss"),
        transferTool,
      ]
    : tools;

  return {
    ...existingModel,
    messages: nextMessages,
    tools: nextTools,
  };
}

// Patch the assistant config so it waits for the first "hello", speaks the
// PowerDial handoff line, then warm-transfers through Vapi to the Verizon line.
// Safe to run on every prep — Vapi accepts repeated PATCHes idempotently.
async function applyFastResponseSettings(assistantId: string, humanTransferPhone = DEFAULT_POWERDIAL_HUMAN_TRANSFER_PHONE) {
  try {
    const currentAssistant = await fetchVapiJson(`/assistant/${assistantId}`, { method: "GET" });
    const existingModel = currentAssistant.response.ok ? currentAssistant.data?.model : null;
    const mergedModel = mergePowerDialAssistantModel(existingModel, normalizePhone(humanTransferPhone));
    const fastSettings = {
      firstMessageMode: "assistant-waits-for-user",
      firstMessage: POWERDIAL_AI_ASSIST_FIRST_MESSAGE,
      ...(mergedModel ? { model: mergedModel } : {}),
      // How quickly the assistant starts responding once it detects end-of-speech
      startSpeakingPlan: {
        waitSeconds: 0.2,
        smartEndpointingEnabled: "livekit",
        transcriptionEndpointingPlan: {
          onPunctuationSeconds: 0.1,
          onNoPunctuationSeconds: 1.0,
          onNumberSeconds: 0.5,
        },
      },
      // Keep the assistant from cutting itself off too aggressively
      stopSpeakingPlan: {
        numWords: 2,
        voiceSeconds: 0.2,
        backoffSeconds: 1.0,
      },
    };

    const result = await fetchVapiJson(`/assistant/${assistantId}`, {
      method: "PATCH",
      body: JSON.stringify(fastSettings),
    });

    if (!result.response.ok) {
      console.warn(`[powerdial] applyFastResponseSettings PATCH failed for ${assistantId}: HTTP ${result.response.status}`, result.data?.message || result.data);
    } else {
      console.log(`[powerdial] applyFastResponseSettings ok for ${assistantId}`);
    }
  } catch (err) {
    console.warn(`[powerdial] applyFastResponseSettings exception for ${assistantId}:`, err);
  }
}

export async function prepareVapiOutboundAssistant(
  assistantId: string,
  humanTransferPhone = DEFAULT_POWERDIAL_HUMAN_TRANSFER_PHONE,
): Promise<VapiAssistantPreparationResult> {
  const resolvedAssistantId = assistantId.trim();

  if (!resolvedAssistantId) {
    return {
      ok: false,
      phoneNumber: null,
      currentAssistantId: null,
      details: "Missing assistant ID",
    };
  }

  if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID) {
    return {
      ok: false,
      phoneNumber: null,
      currentAssistantId: null,
      details: "Missing Vapi configuration",
    };
  }

  // Tune the assistant for instant first-word response (fire-and-forget; non-blocking on errors)
  await applyFastResponseSettings(resolvedAssistantId, humanTransferPhone);

  try {
    const patchResult = await fetchVapiJson(`/phone-number/${VAPI_PHONE_NUMBER_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ assistantId: resolvedAssistantId }),
    });

    let phoneNumber = extractVapiPhoneNumber(patchResult.data);
    let currentAssistantId = extractVapiAssistantId(patchResult.data);

    if (!patchResult.response.ok) {
      return {
        ok: false,
        phoneNumber,
        currentAssistantId,
        details: patchResult.data?.message || patchResult.data?.error || patchResult.data?.raw || `HTTP ${patchResult.response.status}`,
      };
    }

    if (currentAssistantId === resolvedAssistantId) {
      return {
        ok: true,
        phoneNumber,
        currentAssistantId,
        details: null,
      };
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await wait(250);

      const getResult = await fetchVapiJson(`/phone-number/${VAPI_PHONE_NUMBER_ID}`, {
        method: "GET",
      });

      if (!getResult.response.ok) break;

      phoneNumber = extractVapiPhoneNumber(getResult.data) || phoneNumber;
      currentAssistantId = extractVapiAssistantId(getResult.data);

      if (currentAssistantId === resolvedAssistantId) {
        return {
          ok: true,
          phoneNumber,
          currentAssistantId,
          details: null,
        };
      }
    }

    return {
      ok: false,
      phoneNumber,
      currentAssistantId,
      details: currentAssistantId
        ? `Vapi phone is still mapped to ${currentAssistantId}`
        : "Unable to confirm Vapi phone assistant",
    };
  } catch (err) {
    return {
      ok: false,
      phoneNumber: null,
      currentAssistantId: null,
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchTwilioJson(path: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}${path}`,
    {
      ...init,
      headers,
    },
  );

  const text = await response.text();
  let data: any = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { response, data };
}

async function listAvailableTwilioFromNumbers(): Promise<string[]> {
  const numbers = new Set<string>();
  const [incoming, outgoingCallerIds] = await Promise.all([
    fetchTwilioJson("/IncomingPhoneNumbers.json?PageSize=20", { method: "GET" }),
    fetchTwilioJson("/OutgoingCallerIds.json?PageSize=20", { method: "GET" }),
  ]);

  for (const item of incoming.data?.incoming_phone_numbers || []) {
    if (item?.phone_number) numbers.add(normalizePhone(String(item.phone_number)));
  }

  for (const item of outgoingCallerIds.data?.outgoing_caller_ids || []) {
    if (item?.phone_number) numbers.add(normalizePhone(String(item.phone_number)));
  }

  return Array.from(numbers).filter(Boolean);
}

function isTwilioCallerIdError(twilioData: any) {
  return TWILIO_CALLER_ID_ERROR_CODES.has(Number(twilioData?.code));
}

function buildCallParams(args: {
  phone: string;
  from: string;
  campaignId: string;
  queueItemId: string;
  callLogId: string;
}) {
  const webhookUrl = `${supabaseUrl}/functions/v1/powerdial-webhook`;

  return new URLSearchParams({
    To: args.phone,
    From: args.from,
    // DetectMessageEnd waits until the answering-machine greeting + beep
    // finishes before firing AMD with AnsweredBy="machine_end_beep". This
    // gives us perfect timing to drop our pre-recorded voicemail right
    // after the beep — no guess-pause required. Human answers still fire
    // quickly as AnsweredBy="human" within ~1-2s of "hello".
    MachineDetection: "DetectMessageEnd",
    AsyncAmd: "true",
    MachineDetectionTimeout: "18",
    MachineDetectionSpeechThreshold: "2400",
    MachineDetectionSpeechEndThreshold: "1200",
    MachineDetectionSilenceTimeout: "5000",
    AsyncAmdStatusCallback: `${webhookUrl}?type=amd&campaign_id=${args.campaignId}&queue_item_id=${args.queueItemId}&call_log_id=${args.callLogId}`,
    StatusCallback: `${webhookUrl}?type=status&campaign_id=${args.campaignId}&queue_item_id=${args.queueItemId}&call_log_id=${args.callLogId}`,
    StatusCallbackEvent: "initiated ringing answered completed",
    Url: `${webhookUrl}?type=twiml&campaign_id=${args.campaignId}&queue_item_id=${args.queueItemId}&call_log_id=${args.callLogId}`,
    Timeout: "30",
  });
}

// HARD PIN: all PowerDial outbound calls (including VMD campaigns) MUST
// originate from this verified Twilio caller ID. Overrides campaign
// settings and env vars to guarantee a single consistent outbound number.
const PINNED_VERIFIED_CALLER_ID = "+17028298105";

export async function resolveTwilioFromNumber(_configuredFrom = TWILIO_FROM) {
  const availableFromNumbers = await listAvailableTwilioFromNumbers();
  // Always prefer the pinned verified caller ID, regardless of what the
  // caller passed in or what campaign.settings.from_number says.
  if (availableFromNumbers.includes(PINNED_VERIFIED_CALLER_ID)) {
    return { resolvedFrom: PINNED_VERIFIED_CALLER_ID, availableFromNumbers };
  }
  // If Twilio doesn't list it as a verified/purchased number, still try it
  // — Twilio will reject with a clear caller-id error and we'll surface
  // that instead of silently calling from the wrong number.
  return { resolvedFrom: PINNED_VERIFIED_CALLER_ID, availableFromNumbers };
}

async function markCallFailed(
  campaign: any,
  queueItem: any,
  callLogId: string | null | undefined,
  meta: Record<string, unknown> = {},
) {
  if (callLogId) {
    await sb.from("powerdial_call_logs").update({
      twilio_status: "failed",
      amd_result: "failed",
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    }).eq("id", callLogId);
  }

  await sb.from("powerdial_queue").update({ status: "completed", last_result: "failed" }).eq("id", queueItem.id);
  await sb.from("powerdial_campaigns").update({
    failed_count: Number(campaign.failed_count || 0) + 1,
    completed_count: Number(campaign.completed_count || 0) + 1,
  }).eq("id", campaign.id);
}

// ===== 24-HOUR DUPLICATE-DIAL GUARD =====
// Blocks any phone that has already been dialed (across ALL campaigns) in the
// last 24 hours, OR has already been successfully connected in THIS campaign.
// Bypassable via campaign.settings.bypass_duplicate_guard === true.
async function checkDuplicateDialGuard(
  campaign: any,
  queueItem: any,
  phone: string,
  logPrefix: string,
): Promise<DialNextResult | null> {
  const bypass = Boolean((campaign?.settings || {})?.bypass_duplicate_guard);
  if (bypass) return null;

  // 1) Hard block: already connected in THIS campaign (queue reset case)
  const { data: priorConnected } = await sb
    .from("powerdial_call_logs")
    .select("id, twilio_call_sid")
    .eq("campaign_id", campaign.id)
    .eq("phone", phone)
    .or("amd_result.eq.human,disposition.eq.transferred_to_human,disposition.eq.connected_to_vapi")
    .order("created_at", { ascending: false })
    .limit(1);

  if (priorConnected?.length) {
    console.log(`${logPrefix} Skipping ${phone} — already connected in this campaign`);
    await sb.from("powerdial_queue").update({
      status: "completed",
      last_result: "skipped_already_connected",
    }).eq("id", queueItem.id).in("status", ["pending", "retry_later", "dialing"]);
    return { dialed: false, reason: "already_connected_in_campaign", message: `${phone} already reached in this campaign` };
  }

  // 2) Hard block: dialed (anywhere) within the last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await sb
    .from("powerdial_call_logs")
    .select("id, campaign_id, created_at")
    .eq("phone", phone)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (recent?.length) {
    console.log(`${logPrefix} Skipping ${phone} — dialed within last 24h (log ${recent[0].id}, campaign ${recent[0].campaign_id})`);
    await sb.from("powerdial_queue").update({
      status: "skipped",
      last_result: "skipped_24h_duplicate",
    }).eq("id", queueItem.id).in("status", ["pending", "retry_later", "dialing"]);
    return { dialed: false, reason: "duplicate_24h", message: `${phone} dialed within last 24 hours` };
  }

  return null;
}

async function placeCall(campaign: any, queueItem: any, logPrefix: string): Promise<DialNextResult> {
  const phone = normalizePhone(queueItem.phone);
  const selectedAssistantId = resolvePowerDialAssistantId((campaign.settings || {}) as Record<string, unknown>);

  if (!phone) {
    await markCallFailed(campaign, queueItem, null, {
      twilio_error: { message: "Invalid phone number" },
      original_phone: queueItem.phone || null,
    });
    return { dialed: false, reason: "invalid_phone", message: "Invalid phone number" };
  }

  // ===== DUPLICATE-DIAL GUARD =====
  const dupCheck = await checkDuplicateDialGuard(campaign, queueItem, phone, logPrefix);
  if (dupCheck) return dupCheck;

  const { data: dialLock } = await sb
    .from("powerdial_queue")
    .update({
      status: "dialing",
      last_dialed_at: new Date().toISOString(),
      last_result: null,
      retry_at: null,
    })
    .eq("id", queueItem.id)
    .in("status", ["pending", "retry_later"])
    .select("id")
    .maybeSingle();

  if (!dialLock) {
    return { dialed: false, reason: "queue_item_not_available" };
  }

  await sb.from("powerdial_campaigns").update({ current_index: queueItem.position }).eq("id", campaign.id);

  const { data: log, error: logError } = await sb.from("powerdial_call_logs").insert({
    campaign_id: campaign.id,
    queue_item_id: queueItem.id,
    customer_id: queueItem.customer_id,
    phone,
    attempt_number: Number(queueItem.retry_count || 0) + 1,
    twilio_status: "initiated",
    meta: {
      assistant_id: selectedAssistantId,
      assistant_source: "campaign_settings",
    },
  }).select("id").single();

  if (logError) {
    console.error(`${logPrefix} Call log insert failed for ${phone}:`, logError);
    await sb.from("powerdial_queue").update({
      status: "pending",
      last_result: logError.code === "23505" ? "active_duplicate_call" : "call_log_insert_failed",
    }).eq("id", queueItem.id).eq("status", "dialing");
    return { dialed: false, reason: logError.code === "23505" ? "active_duplicate_call" : "call_log_insert_failed" };
  }

  const callLogId = log?.id;
  const safeCallLogId = callLogId || "";
  const campaignFromSetting = normalizePhone((campaign.settings || {})?.from_number || "");
  const configuredFrom = campaignFromSetting || (TWILIO_FROM ? normalizePhone(TWILIO_FROM) : "");
  const resolution = await resolveTwilioFromNumber(configuredFrom);
  const assistantPreparation = await prepareVapiOutboundAssistant(
    selectedAssistantId,
    normalizePhone((campaign.settings || {})?.human_transfer_phone) || DEFAULT_POWERDIAL_HUMAN_TRANSFER_PHONE,
  );
  const baseMeta: Record<string, unknown> = {
    assistant_id: selectedAssistantId,
    assistant_source: "campaign_settings",
    assistant_prepare_ok: assistantPreparation.ok,
    ...(assistantPreparation.details ? { assistant_prepare_error: assistantPreparation.details } : {}),
    ...(assistantPreparation.phoneNumber ? { vapi_phone: assistantPreparation.phoneNumber } : {}),
    ...(assistantPreparation.currentAssistantId ? { vapi_phone_assistant_id: assistantPreparation.currentAssistantId } : {}),
  };
  let selectedFrom = resolution.resolvedFrom || configuredFrom;
  let availableFromNumbers = resolution.availableFromNumbers;

  try {
    if (!selectedFrom) {
      const message = "No verified or purchased Twilio caller ID is available for this account.";
      await markCallFailed(campaign, queueItem, callLogId, {
        ...baseMeta,
        twilio_error: { message },
        configured_from: configuredFrom || null,
        available_from_numbers: availableFromNumbers,
        needs_twilio_verified_from: true,
      });
      return { dialed: false, reason: "twilio_from_missing", message };
    }

    let twilioResult = await fetchTwilioJson("/Calls.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: buildCallParams({
        phone,
        from: selectedFrom,
        campaignId: campaign.id,
        queueItemId: queueItem.id,
        callLogId: safeCallLogId,
      }).toString(),
    });

    let twilioResp = twilioResult.response;
    let twilioData = twilioResult.data;

    if (!twilioResp.ok && isTwilioCallerIdError(twilioData)) {
      const fallbackResolution = await resolveTwilioFromNumber("");
      availableFromNumbers = fallbackResolution.availableFromNumbers;

      if (fallbackResolution.resolvedFrom && fallbackResolution.resolvedFrom !== selectedFrom) {
        selectedFrom = fallbackResolution.resolvedFrom;
        twilioResult = await fetchTwilioJson("/Calls.json", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: buildCallParams({
            phone,
            from: selectedFrom,
            campaignId: campaign.id,
            queueItemId: queueItem.id,
            callLogId: safeCallLogId,
          }).toString(),
        });
        twilioResp = twilioResult.response;
        twilioData = twilioResult.data;
      }
    }

    if (!twilioResp.ok) {
      console.error(`${logPrefix} Twilio error:`, twilioData);
      await markCallFailed(campaign, queueItem, callLogId, {
        ...baseMeta,
        twilio_error: twilioData,
        configured_from: configuredFrom || null,
        resolved_from: selectedFrom || null,
        available_from_numbers: availableFromNumbers,
        needs_twilio_verified_from: isTwilioCallerIdError(twilioData),
      });
      return {
        dialed: false,
        reason: "twilio_error",
        message: twilioData?.message || "Twilio call failed",
        twilio_code: twilioData?.code,
      };
    }

    if (callLogId) {
      await sb.from("powerdial_call_logs").update({
        twilio_call_sid: twilioData.sid,
        twilio_status: "initiated",
        meta: {
          ...baseMeta,
          resolved_from: selectedFrom,
          ...(selectedFrom !== configuredFrom ? {
            configured_from: configuredFrom || null,
            auto_switched_from_number: true,
          } : {}),
        },
      }).eq("id", callLogId);
    }

    return { dialed: true, from: selectedFrom };
  } catch (err) {
    console.error(`${logPrefix} Call placement error:`, err);
    await markCallFailed(campaign, queueItem, callLogId, {
      ...baseMeta,
      exception: err instanceof Error ? err.message : String(err),
      configured_from: configuredFrom || null,
      resolved_from: selectedFrom || null,
    });
    return {
      dialed: false,
      reason: "exception",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function dialNext(campaignId: string, logPrefix = "[powerdial]"): Promise<DialNextResult> {
  const { data: campaign, error: cErr } = await sb
    .from("powerdial_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (cErr || !campaign) return { dialed: false, reason: "campaign_not_found" };
  if (campaign.status !== "running") return { dialed: false, reason: "campaign_not_running" };

  await recoverCancelledTripleDialQueue(campaignId);

  if (await hasActiveConnectedCall(campaignId)) {
    return { dialed: false, reason: "active_human_call" };
  }

  const { data: activeDialing } = await sb
    .from("powerdial_queue")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "dialing")
    .limit(1);

  if (activeDialing?.length) {
    return { dialed: false, reason: "already_dialing" };
  }

  const { data: nextItems } = await sb
    .from("powerdial_queue")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("position", { ascending: true })
    .limit(1);

  if (nextItems?.length) {
    return await placeCall(campaign, nextItems[0], logPrefix);
  }

  const { data: retryItems } = await sb
    .from("powerdial_queue")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "retry_later")
    .lte("retry_at", new Date().toISOString())
    .order("position", { ascending: true })
    .limit(1);

  if (retryItems?.length) {
    return await placeCall(campaign, retryItems[0], logPrefix);
  }

  const { data: futureRetries } = await sb
    .from("powerdial_queue")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "retry_later")
    .limit(1);

  if (futureRetries?.length) {
    return { dialed: false, reason: "waiting_for_retry_window" };
  }

  await sb.from("powerdial_campaigns").update({
    status: "completed",
    ended_at: new Date().toISOString(),
  }).eq("id", campaignId);

  return { dialed: false, reason: "campaign_completed" };
}

// Twilio call statuses that indicate the lead actually answered the phone.
// If a sibling has reached one of these states when we cancel, the lead picked
// up but won't be talked to — they get a 1-hour cooldown + callback flag.
const TWILIO_ANSWERED_STATUSES = new Set(["in-progress", "answered", "completed"]);

// 1 hour cooldown for leads that picked up but were dropped (warm hand-off lost the race).
const HUMAN_PICKUP_COOLDOWN_MS = 60 * 60 * 1000;

export async function cancelSiblingCalls(batchId: string, winnerCallLogId: string, campaignId: string) {
  if (!batchId) return;

  const { data: siblings } = await sb
    .from("powerdial_call_logs")
    .select("id, twilio_call_sid, queue_item_id, amd_result, phone")
    .eq("batch_id", batchId)
    .neq("id", winnerCallLogId);

  if (!siblings?.length) return;

  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
  const twilioAuthHeader = `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`;

  let answeredCount = 0;
  let unansweredCount = 0;

  for (const sibling of siblings) {
    // 1) Probe Twilio FIRST to figure out whether the lead actually answered before we kill the call.
    let leadAnswered = sibling.amd_result === "human";
    if (!leadAnswered && sibling.twilio_call_sid) {
      try {
        const probe = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${sibling.twilio_call_sid}.json`,
          { headers: { Authorization: twilioAuthHeader } },
        );
        if (probe.ok) {
          const data = await probe.json();
          const status = String(data?.status || "").toLowerCase();
          const answeredBy = String(data?.answered_by || "").toLowerCase();
          if (TWILIO_ANSWERED_STATUSES.has(status) || answeredBy === "human") {
            leadAnswered = true;
          }
        }
      } catch (err) {
        console.error(`[powerdial] Failed to probe sibling ${sibling.twilio_call_sid}:`, err);
      }
    }

    // 2) Mark call log so the webhook knows this was a triple-dial cancellation
    //    (and remembers whether the lead picked up).
    await sb.from("powerdial_call_logs").update({
      amd_result: "cancelled_triple_dial",
      twilio_status: "canceled",
      connected_to_vapi: false,
      meta: {
        cancelled_due_to_triple_dial: true,
        lead_answered_during_race: leadAnswered,
        cancelled_at: new Date().toISOString(),
      },
    }).eq("id", sibling.id);

    // 3) Hang up the Twilio call (we already inspected its state above).
    if (sibling.twilio_call_sid) {
      try {
        await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${sibling.twilio_call_sid}.json`,
          {
            method: "POST",
            headers: {
              Authorization: twilioAuthHeader,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ Status: "completed" }).toString(),
          },
        );
      } catch (err) {
        console.error(`[powerdial] Failed to cancel sibling call ${sibling.twilio_call_sid}:`, err);
      }
    }

    // 4) Decide queue fate:
    //    - Lead answered → push to "callback later" with a 1-hour cooldown so we don't spam them.
    //    - Lead never answered → safe to drop straight back to pending for the next batch.
    if (sibling.queue_item_id) {
      if (leadAnswered) {
        const retryAt = new Date(Date.now() + HUMAN_PICKUP_COOLDOWN_MS).toISOString();
        await sb.from("powerdial_queue").update({
          status: "retry_later",
          last_result: "callback_human_pickup",
          retry_at: retryAt,
        }).eq("id", sibling.queue_item_id);

        // Lightweight DNC log entry for audit / cross-campaign visibility.
        if (sibling.phone) {
          try {
            await sb.from("lh_dnc_registry").upsert({
              phone: sibling.phone,
              reason: "cooldown_human_pickup",
              call_count: 1,
              last_called_at: new Date().toISOString(),
              source_list_id: null,
            }, { onConflict: "phone" });
          } catch (err) {
            console.error(`[powerdial] DNC cooldown log failed for ${sibling.phone}:`, err);
          }
        }

        answeredCount++;
        console.log(`[powerdial] Sibling ${sibling.phone || sibling.queue_item_id} answered during race — scheduled callback at ${retryAt}`);
      } else {
        await sb.from("powerdial_queue").update({
          status: "pending",
          last_result: null,
        }).eq("id", sibling.queue_item_id);
        unansweredCount++;
      }
    }
  }

  console.log(`[powerdial] Cancelled ${siblings.length} sibling calls for batch ${batchId} (callback: ${answeredCount}, requeued: ${unansweredCount})`);
}

export async function dialNextBatch(campaignId: string, batchSize: number, logPrefix = "[powerdial]"): Promise<DialNextResult> {
  if (batchSize <= 1) {
    return dialNext(campaignId, logPrefix);
  }

  const { data: campaign, error: cErr } = await sb
    .from("powerdial_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (cErr || !campaign) return { dialed: false, reason: "campaign_not_found" };
  if (campaign.status !== "running") return { dialed: false, reason: "campaign_not_running" };

  await recoverCancelledTripleDialQueue(campaignId);

  if (await hasActiveConnectedCall(campaignId)) {
    return { dialed: false, reason: "active_human_call" };
  }

  const { data: activeDialing } = await sb
    .from("powerdial_queue")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "dialing")
    .limit(1);

  if (activeDialing?.length) {
    return { dialed: false, reason: "already_dialing" };
  }

  // Get next N pending items
  const { data: nextItems } = await sb
    .from("powerdial_queue")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("position", { ascending: true })
    .limit(batchSize);

  const items = nextItems || [];

  if (!items.length) {
    // Fall back to single dial for retries / completion logic
    return dialNext(campaignId, logPrefix);
  }

  // Generate batch_id
  const batchId = crypto.randomUUID();

  // Dial all items in parallel
  const results = await Promise.allSettled(
    items.map((item) => placeCallWithBatch(campaign, item, batchId, logPrefix)),
  );

  const anyDialed = results.some(
    (r) => r.status === "fulfilled" && r.value.dialed,
  );

  return { dialed: anyDialed, reason: anyDialed ? undefined : "all_failed" };
}

async function placeCallWithBatch(campaign: any, queueItem: any, batchId: string, logPrefix: string): Promise<DialNextResult> {
  const phone = normalizePhone(queueItem.phone);
  const selectedAssistantId = resolvePowerDialAssistantId((campaign.settings || {}) as Record<string, unknown>);

  if (!phone) {
    return { dialed: false, reason: "invalid_phone" };
  }

  const dupCheck = await checkDuplicateDialGuard(campaign, queueItem, phone, logPrefix);
  if (dupCheck) return dupCheck;

  const { data: dialLock } = await sb
    .from("powerdial_queue")
    .update({
      status: "dialing",
      last_dialed_at: new Date().toISOString(),
      last_result: null,
      retry_at: null,
    })
    .eq("id", queueItem.id)
    .in("status", ["pending", "retry_later"])
    .select("id")
    .maybeSingle();

  if (!dialLock) {
    return { dialed: false, reason: "queue_item_not_available" };
  }

  const { data: log, error: logError } = await sb.from("powerdial_call_logs").insert({
    campaign_id: campaign.id,
    queue_item_id: queueItem.id,
    customer_id: queueItem.customer_id,
    phone,
    attempt_number: Number(queueItem.retry_count || 0) + 1,
    twilio_status: "initiated",
    batch_id: batchId,
    meta: {
      assistant_id: selectedAssistantId,
      assistant_source: "campaign_settings",
      triple_dial: true,
      batch_id: batchId,
    },
  }).select("id").single();

  if (logError) {
    console.error(`${logPrefix} Triple-dial call log insert failed for ${phone}:`, logError);
    await sb.from("powerdial_queue").update({
      status: "pending",
      last_result: logError.code === "23505" ? "active_duplicate_call" : "call_log_insert_failed",
    }).eq("id", queueItem.id).eq("status", "dialing");
    return { dialed: false, reason: logError.code === "23505" ? "active_duplicate_call" : "call_log_insert_failed" };
  }

  const callLogId = log?.id || "";

  const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER") || "";
  const resolution = await resolveTwilioFromNumber(TWILIO_FROM);
  const selectedFrom = resolution.resolvedFrom || (TWILIO_FROM ? normalizePhone(TWILIO_FROM) : "");

  if (!selectedFrom) {
    return { dialed: false, reason: "twilio_from_missing" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const webhookUrl = `${supabaseUrl}/functions/v1/powerdial-webhook`;

  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;

  const callParams = new URLSearchParams({
    To: phone,
    From: selectedFrom,
    // Triple-dial must use the same beep-aware AMD mode as single dial.
    // "Enable" returns generic machine results too early and misses the
    // voicemail beep, which prevents reliable voicemail drops.
    MachineDetection: "DetectMessageEnd",
    AsyncAmd: "true",
    MachineDetectionTimeout: "18",
    MachineDetectionSpeechThreshold: "2400",
    MachineDetectionSpeechEndThreshold: "1200",
    MachineDetectionSilenceTimeout: "5000",
    AsyncAmdStatusCallback: `${webhookUrl}?type=amd&campaign_id=${campaign.id}&queue_item_id=${queueItem.id}&call_log_id=${callLogId}`,
    StatusCallback: `${webhookUrl}?type=status&campaign_id=${campaign.id}&queue_item_id=${queueItem.id}&call_log_id=${callLogId}`,
    StatusCallbackEvent: "initiated ringing answered completed",
    Url: `${webhookUrl}?type=twiml&campaign_id=${campaign.id}&queue_item_id=${queueItem.id}&call_log_id=${callLogId}`,
    Timeout: "30",
  });

  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: callParams.toString(),
      },
    );

    const data = await resp.json();

    if (!resp.ok) {
      console.error(`${logPrefix} Triple-dial Twilio error for ${phone}:`, data);
      return { dialed: false, reason: "twilio_error" };
    }

    if (callLogId) {
      await sb.from("powerdial_call_logs").update({
        twilio_call_sid: data.sid,
        twilio_status: "initiated",
      }).eq("id", callLogId);
    }

    console.log(`${logPrefix} Triple-dial: placed call to ${phone} (batch ${batchId})`);
    return { dialed: true, from: selectedFrom };
  } catch (err) {
    console.error(`${logPrefix} Triple-dial error for ${phone}:`, err);
    return { dialed: false, reason: "exception" };
  }
}

export async function advanceCampaign(campaignId: string, logPrefix = "[powerdial]"): Promise<DialNextResult> {
  const { data: campaign } = await sb
    .from("powerdial_campaigns")
    .select("settings, status")
    .eq("id", campaignId)
    .single();

  if (!campaign || campaign.status !== "running") {
    return { dialed: false, reason: "campaign_not_running" };
  }

  const delay = Math.min(
    Number((campaign.settings as any)?.call_delay_ms || DEFAULT_POWERDIAL_SETTINGS.call_delay_ms),
    5000,
  );

  if (delay > 0) {
    await wait(delay);
  }

  const tripleDialEnabled = Boolean((campaign.settings as any)?.triple_dial);
  if (tripleDialEnabled) {
    return dialNextBatch(campaignId, 3, logPrefix);
  }
  return dialNext(campaignId, logPrefix);
}
