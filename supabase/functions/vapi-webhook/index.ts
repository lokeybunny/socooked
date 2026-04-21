import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Gmail helpers ───
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const IMPERSONATE_EMAIL = "warren@stu25.com";

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getGmailAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email, sub: IMPERSONATE_EMAIL,
    scope: "https://www.googleapis.com/auth/gmail.modify",
    aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600,
  })));
  const signingInput = `${header}.${payload}`;
  const pemBody = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", keyData, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput)));
  const jwt = `${signingInput}.${base64url(sig)}`;
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("Gmail auth failed: " + JSON.stringify(json));
  return json.access_token;
}

function rfc2047Base64(str: string): string {
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(str)))}?=`;
}

async function sendGmailNotification(recipientEmail: string, subject: string, htmlBody: string) {
  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!saJson) { console.error("No GOOGLE_SERVICE_ACCOUNT_JSON"); return; }
  const sa = JSON.parse(saJson);
  const accessToken = await getGmailAccessToken(sa);
  const boundary = "boundary_" + crypto.randomUUID().replace(/-/g, "");
  const rawMessage = [
    `From: Warren Guru <${IMPERSONATE_EMAIL}>`, `To: ${recipientEmail}`,
    `Subject: ${rfc2047Base64(subject)}`, `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`, ``,
    `--${boundary}`, `Content-Type: text/plain; charset=UTF-8`, ``,
    htmlBody.replace(/<[^>]+>/g, ""), ``, `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`, ``, htmlBody, ``, `--${boundary}--`,
  ].join("\r\n");
  const encoded = btoa(unescape(encodeURIComponent(rawMessage))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await fetch(`${GMAIL_API}/users/me/messages/send`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });
  if (!res.ok) { console.error("Gmail send failed:", res.status, await res.text()); }
  else { console.log("Email sent to", recipientEmail); }
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Phone normalization ───
function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function isPlaceholderLeadName(value: unknown): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.startsWith("direct caller (") || normalized.startsWith("caller (");
}

function scoreCustomerMatch(row: any, criteria: { callId?: string; phone?: string; phones?: string[]; email?: string; source?: string | null }): number {
  const meta = (row?.meta as any) || {};
  let score = 0;

  if (criteria.callId && String(meta.vapi_call_id || "") === criteria.callId) score += 100;
  if (criteria.source && row?.source === criteria.source) score += 25;
  const allPhones = [...(criteria.phones || []), ...(criteria.phone ? [criteria.phone] : [])].filter(Boolean);
  const rowPhone = normalizePhone(row?.phone || "");
  if (rowPhone && allPhones.includes(rowPhone)) score += 20;
  if (criteria.email && normalizeEmail(row?.email) === criteria.email) score += 20;
  if (!isPlaceholderLeadName(row?.full_name)) score += 5;
  if (row?.email) score += 2;
  if (row?.phone) score += 2;

  return score;
}

async function findBestCustomerMatch(
  sb: any,
  criteria: { callId?: string; phone?: string; phones?: string[]; email?: string; source?: string | null },
) {
  const matches = new Map<string, any>();
  const remember = (rows: any[] | null | undefined) => {
    for (const row of rows || []) {
      if (row?.id && !matches.has(row.id)) matches.set(row.id, row);
    }
  };

  if (criteria.callId) {
    const { data } = await sb.from("customers").select("*")
      .filter("meta->>vapi_call_id", "eq", criteria.callId)
      .order("updated_at", { ascending: false })
      .limit(10);
    remember(data);
  }

  // Search by all provided phone numbers
  const allPhones = [...(criteria.phones || []), ...(criteria.phone ? [criteria.phone] : [])].filter(
    (p) => p && p.length >= 10
  );
  for (const ph of [...new Set(allPhones)]) {
    const { data } = await sb.from("customers").select("*")
      .eq("phone", ph)
      .order("updated_at", { ascending: false })
      .limit(10);
    remember(data);
  }

  if (criteria.email) {
    const { data } = await sb.from("customers").select("*")
      .eq("email", criteria.email)
      .order("updated_at", { ascending: false })
      .limit(10);
    remember(data);
  }

  return Array.from(matches.values()).sort((a, b) => {
    const scoreDiff = scoreCustomerMatch(b, criteria) - scoreCustomerMatch(a, criteria);
    if (scoreDiff !== 0) return scoreDiff;

    return new Date(b?.updated_at || b?.created_at || 0).getTime()
      - new Date(a?.updated_at || a?.created_at || 0).getTime();
  })[0] || null;
}

// ─── Assistant IDs ───
const WEB_INBOUND_ID = "fea7fb27-2311-4f42-9bc1-d6e6fa966ab8";
const VIDEO_INBOUND_ID = "29ca9037-ff4c-4d56-a9c7-6c5bc1ab1b38";
const WEB_OUTBOUND_ID = "dc35680f-8763-4702-84d7-e3df267ddaf9";
const VIDEO_OUTBOUND_ID = "0045f12e-56e2-4245-971b-1f7dd2069282";

// ─── Phone numbers mapped to funnels ───
// (702) 357-4528 → videography line
const VIDEOGRAPHY_PHONE_NUMBERS = ["+17023574528", "7023574528"];
// Add web design phone numbers here if needed
const WEBDESIGN_PHONE_NUMBERS: string[] = [];

// ─── Blocked time slots (PST) ───
const BLOCKED_SLOTS = [
  { startH: 8, startM: 0, endH: 10, endM: 0, label: "8:00 AM - 10:00 AM PST" },
  { startH: 14, startM: 30, endH: 15, endM: 30, label: "2:30 PM - 3:30 PM PST" },
];

function parseTime(timeStr: string): { hour: number; min: number } {
  const tMatch = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (!tMatch) return { hour: 0, min: 0 };
  let hour = parseInt(tMatch[1]);
  const min = tMatch[2] ? parseInt(tMatch[2]) : 0;
  const period = (tMatch[3] || "").replace(/\./g, "").toLowerCase();
  if (period === "pm" && hour < 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  return { hour, min };
}

function getPhoneNumberFunnel(call: any): { source: string; category: string; tag: string; label: string } | null {
  // Extract the Vapi phone number this call came TO (the "twilioPhoneNumber" or "phoneNumber")
  const phoneNum = normalizePhone(
    call?.phoneNumber?.twilioPhoneNumber || call?.phoneNumber?.number || call?.phoneCallProvider?.twilioPhoneNumber || ""
  );
  if (!phoneNum) return null;
  const digits = phoneNum.replace(/\D/g, "");
  if (VIDEOGRAPHY_PHONE_NUMBERS.some(p => digits.endsWith(p.replace(/\D/g, "")))) {
    return { source: "videography-landing", category: "videography", tag: "video", label: "Videography" };
  }
  if (WEBDESIGN_PHONE_NUMBERS.some(p => digits.endsWith(p.replace(/\D/g, "")))) {
    return { source: "webdesign-landing", category: "web_design", tag: "web", label: "Web Design" };
  }
  return null;
}

function getAssistantFunnel(assistantId: string, call?: any): { source: string; category: string; tag: string; label: string } | null {
  if (assistantId === WEB_INBOUND_ID || assistantId === WEB_OUTBOUND_ID)
    return { source: "webdesign-landing", category: "web_design", tag: "web", label: "Web Design" };
  if (assistantId === VIDEO_INBOUND_ID || assistantId === VIDEO_OUTBOUND_ID)
    return { source: "videography-landing", category: "videography", tag: "video", label: "Videography" };
  // Fallback: route by phone number the call came TO
  if (call) return getPhoneNumberFunnel(call);
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload = await req.json();
    const message = payload?.message ?? payload;
    const messageType = String(message?.type || payload?.type || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-");

    console.log("Vapi webhook event:", messageType || "unknown", "call:", message?.call?.id || payload?.call?.id);

    // ════════════════════════════════════════════
    // PART 1: REAL-TIME TOOL CALLS (during call)
    // ════════════════════════════════════════════
    if (messageType === "function-call" || messageType === "tool-calls") {
      const toolCall = message?.toolCallList?.[0]
        || message?.toolWithToolCallList?.[0]?.toolCall
        || message?.toolCalls?.[0]
        || null;
      const functionCall = message?.functionCall
        || toolCall?.function
        || (toolCall?.name ? toolCall : null);
      const toolCallId = toolCall?.id;
      const fnName = functionCall?.name;
      const rawParams = functionCall?.parameters || functionCall?.arguments;
      const params = typeof rawParams === "string" ? JSON.parse(rawParams) : (rawParams || {});
      
      const callAssistantId = message?.call?.assistantId || message?.call?.assistant?.id || "";
      
      console.log("[vapi-webhook] Tool call:", fnName, JSON.stringify(params));

      const respond = (result: any) => {
        const body = messageType === "tool-calls"
          ? { results: [{ name: fnName, toolCallId, result: JSON.stringify(result) }] }
          : { result: JSON.stringify(result) };
        return new Response(JSON.stringify(body), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      };

      // ──── TOOL: find_contact ────
      if (fnName === "find_contact") {
        const phone = normalizePhone(params.phone || "");
        const email = (params.email || "").trim().toLowerCase();
        
        let contact = null;
        
        // Search by phone first
        if (phone && phone.length >= 10) {
          const { data } = await sb.from("customers").select("id, full_name, email, phone, status, source, notes, tags, meta")
            .eq("phone", phone).order("created_at", { ascending: false }).limit(1).maybeSingle();
          contact = data;
        }
        
        // Fallback: search by email
        if (!contact && email) {
          const { data } = await sb.from("customers").select("id, full_name, email, phone, status, source, notes, tags, meta")
            .eq("email", email).order("created_at", { ascending: false }).limit(1).maybeSingle();
          contact = data;
        }
        
        if (contact) {
          console.log(`[find_contact] Found: ${contact.full_name} (${contact.id})`);
          return respond({
            found: true,
            contact_id: contact.id,
            name: contact.full_name,
            email: contact.email,
            phone: contact.phone,
            status: contact.status,
            source: contact.source,
            notes: contact.notes,
          });
        }
        
        console.log(`[find_contact] No match for phone=${phone} email=${email}`);
        return respond({ found: false, contact_id: null });
      }

      // ──── TOOL: create_or_update_lead ────
      if (fnName === "create_or_update_lead") {
        const name = (params.name || params.full_name || "").trim();
        const paramsPhone = normalizePhone(params.phone || "");
        const callerDevicePhone = normalizePhone(
          message?.call?.customer?.number || message?.call?.phoneNumber?.number || "",
        );
        const phone = paramsPhone || callerDevicePhone;
        const email = normalizeEmail(params.email);
        const serviceType = (params.service_type || "").toLowerCase();
        const notes = params.notes || "";
        const callId = message?.call?.id || "";
        
        const funnel = getAssistantFunnel(callAssistantId, message?.call);
        const source = funnel?.source || (serviceType.includes("video") ? "videography-landing" : "webdesign-landing");
        const funnelTag = funnel?.tag || (serviceType.includes("video") ? "video" : "web");
        
        // Search by BOTH the params phone AND the caller's device phone to avoid duplicates
        const searchPhones = [paramsPhone, callerDevicePhone].filter(Boolean);
        const existing = await findBestCustomerMatch(sb, { callId, phone, phones: searchPhones, email, source });
        
        const existingMeta = (existing?.meta as any) || {};
        const existingTags = Array.isArray(existing?.tags) ? (existing.tags as string[]) : [];
        const nextTags = Array.from(new Set([
          ...existingTags.filter((tag) => tag !== "in_call"), "vapi_inbound_call", funnelTag, "in_call",
        ]));
        const nextMeta = {
          ...existingMeta,
          vapi_call_id: callId,
          vapi_call_status: "in_call",
          vapi_assistant_id: callAssistantId,
          vapi_direct_dial: true,
          vapi_call_started_at: new Date().toISOString(),
          vapi_last_contact: new Date().toISOString(),
          vapi_inbound_notes: notes,
          service_type: serviceType,
          lead_source: "vapi_inbound_call",
          funnel_drafted_at: null,
        };
        
        let contactId: string;
        
        if (existing) {
          // Update existing contact
          await sb.from("customers").update({
            full_name: name || existing.full_name,
            email: email || existing.email,
            phone: phone || existing.phone || callerDevicePhone || null,
            source: existing.source || source,
            tags: nextTags,
            notes: existing.notes
              ? `${existing.notes}\n\n--- Vapi Call Update ---\n${notes}`
              : notes || `Inbound call via ${funnelTag} AI line.`,
            meta: nextMeta,
          }).eq("id", existing.id);
          contactId = existing.id;
          console.log(`[create_or_update_lead] Updated existing: ${contactId}`);
        } else {
          // Create new contact
          const { data: newRow, error: insertError } = await sb.from("customers").insert({
            full_name: name || `Caller (${phone || "Unknown"})`,
            phone: phone || null,
            email: email || null,
            source,
            category: funnel?.category || "web_design",
            status: "lead",
            notes: notes || `Inbound call via ${funnelTag} AI line.`,
            tags: nextTags,
            meta: nextMeta,
          }).select("id").single();
          
          if (insertError) {
            console.error("[create_or_update_lead] Insert error:", insertError);
            return respond({ success: false, error: insertError.message });
          }
          contactId = newRow!.id;
          console.log(`[create_or_update_lead] Created new: ${contactId}`);
        }
        
        // Create/update deal in pipeline
        const { data: existingDeal } = await sb.from("deals")
          .select("id").eq("customer_id", contactId)
          .eq("status", "open").limit(1).maybeSingle();
        
        if (!existingDeal) {
          await sb.from("deals").insert({
            title: `${name || "Caller"} — ${funnel?.label || "Inbound Call"}`,
            customer_id: contactId,
            category: funnel?.category || "web_design",
            stage: "new",
            status: "open",
            pipeline: "default",
            deal_value: 0,
            probability: 25,
            tags: [funnelTag, "vapi_inbound"],
          });
        }
        
        return respond({
          success: true,
          contact_id: contactId,
          is_new: !existing,
          name: name || existing?.full_name,
        });
      }

      // ──── TOOL: check_availability ────
      if (fnName === "check_availability") {
        const requestedDate = params.date;
        const requestedTime = params.time || "";
        const { hour: reqHour, min: reqMin } = parseTime(requestedTime);
        const reqTimeMin = reqHour * 60 + reqMin;
        const sessionDuration = params.duration_minutes || 120;
        const reqEndMin = reqTimeMin + sessionDuration;

        // Check blocked slots
        const blockedConflict = BLOCKED_SLOTS.find(slot => {
          const slotStart = slot.startH * 60 + slot.startM;
          const slotEnd = slot.endH * 60 + slot.endM;
          return reqTimeMin < slotEnd && reqEndMin > slotStart;
        });

        // Check calendar events
        let calendarConflict = false;
        let calendarConflictInfo = "";
        if (requestedDate) {
          const pstToUtcOffset = 7;
          const startUtc = new Date(`${requestedDate}T${String(reqHour).padStart(2, "0")}:${String(reqMin).padStart(2, "0")}:00`);
          startUtc.setHours(startUtc.getHours() + pstToUtcOffset);
          const endUtc = new Date(startUtc.getTime() + sessionDuration * 60 * 1000);

          const { data: conflicts } = await sb.from("calendar_events")
            .select("id, title, start_time, end_time")
            .lt("start_time", endUtc.toISOString())
            .gt("end_time", startUtc.toISOString());

          if (conflicts && conflicts.length > 0) {
            calendarConflict = true;
            calendarConflictInfo = conflicts.map(c => c.title).join(", ");
          }

          // Also check bookings table
          const { data: bookingConflicts } = await sb.from("bookings")
            .select("id, guest_name, start_time, end_time")
            .eq("booking_date", requestedDate)
            .neq("status", "cancelled")
            .lt("start_time", endUtc.toISOString())
            .gt("end_time", startUtc.toISOString());

          if (bookingConflicts && bookingConflicts.length > 0) {
            calendarConflict = true;
            calendarConflictInfo += (calendarConflictInfo ? ", " : "") + bookingConflicts.map(b => b.guest_name).join(", ");
          }
        }

        let resultMessage: string;
        let available = true;
        let reason = "";

        if (blockedConflict) {
          available = false;
          reason = `blocked_window`;
          resultMessage = `That time is NOT available. The ${blockedConflict.label} window is blocked every day. Please suggest a different time outside of 8:00-10:00 AM and 2:30-3:30 PM PST.`;
        } else if (calendarConflict) {
          available = false;
          reason = `existing_booking`;
          resultMessage = `That time is NOT available — there is already a booking at that time (${calendarConflictInfo}). Please suggest a different time.`;
        } else {
          resultMessage = `That time is available! You can confirm the booking for ${requestedTime || "the requested time"} on ${requestedDate || "the requested date"}.`;
        }

        console.log(`[check_availability] date=${requestedDate} time=${requestedTime} available=${available} reason=${reason}`);
        return respond({ available, message: resultMessage, reason });
      }

      // ──── TOOL: create_tentative_booking ────
      if (fnName === "create_tentative_booking") {
        let contactId = params.contact_id || null;
        const date = params.date;
        const time = params.time || "10:00 AM";
        const serviceType = (params.service_type || "").toLowerCase();
        const notes = params.notes || "";
        const callerName = params.name || params.full_name || "";
        const callerPhone = params.phone || "";
        const callerEmail = params.email || "";
        const { hour, min } = parseTime(time);
        
        const funnel = getAssistantFunnel(callAssistantId, message?.call);
        const isVideo = serviceType.includes("video") || funnel?.tag === "video";
        const durationMinutes = params.duration_minutes || (isVideo ? 180 : 60);

        // Build UTC time from PST
        const pstToUtcOffset = 7;
        const startUtc = new Date(`${date}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`);
        startUtc.setHours(startUtc.getHours() + pstToUtcOffset);
        const endUtc = new Date(startUtc.getTime() + durationMinutes * 60 * 1000);

        // Final availability check to prevent double booking
        const { data: conflicts } = await sb.from("calendar_events")
          .select("id").lt("start_time", endUtc.toISOString()).gt("end_time", startUtc.toISOString());
        const hasConflict = !!(conflicts && conflicts.length > 0);

        // Auto-resolve contact from call metadata if no contact_id provided
        let contactName = callerName || "Caller";
        let contactPhone = callerPhone;
        let contactEmail = callerEmail;

        if (!contactId) {
          // Try to find contact from the call's phone number
          const callPhone = normalizePhone(
            callerPhone || message?.call?.customer?.number || message?.call?.phoneNumber?.number || ""
          );
          if (callPhone && callPhone.length >= 10) {
            const { data: found } = await sb.from("customers").select("id, full_name, phone, email")
              .or(`phone.eq.${callPhone},phone.eq.+1${callPhone},phone.eq.+${callPhone}`)
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (found) {
              contactId = found.id;
              contactName = found.full_name || contactName;
              contactPhone = found.phone || contactPhone;
              contactEmail = found.email || contactEmail;
              console.log(`[create_tentative_booking] Auto-resolved contact: ${contactId} (${contactName})`);
            }
          }
        }

        if (contactId) {
          const { data: contact } = await sb.from("customers").select("full_name, phone, email").eq("id", contactId).single();
          if (contact) {
            contactName = contact.full_name || contactName;
            contactPhone = contact.phone || contactPhone;
            contactEmail = contact.email || contactEmail;
          }
        }

        // Create tentative calendar event
        const eventTitle = `${isVideo ? "📹" : "🌐"} ${hasConflict ? "⚠️ CONFLICT — " : ""}${isVideo ? "Videography" : "Web Design"}: ${contactName}`;
        const { data: calEvent, error: calError } = await sb.from("calendar_events").insert({
          title: eventTitle,
          description: `TENTATIVE booking from AI call.\n\nClient: ${contactName}\nPhone: ${contactPhone}\nEmail: ${contactEmail}\nService: ${serviceType || (isVideo ? "Videography" : "Web Design")}\n\n${hasConflict ? "⚠️ CONFLICT: Another event exists at this time. Review needed." : "No conflicts."}\n\nNotes: ${notes}`,
          start_time: startUtc.toISOString(),
          end_time: endUtc.toISOString(),
          category: isVideo ? "videography" : "web_design",
          source: "vapi-ai",
          source_id: message?.call?.id || null,
          customer_id: contactId || null,
          color: hasConflict ? "#ef4444" : (isVideo ? "#8b5cf6" : "#3b82f6"),
          location: "TBD — confirm with client",
        }).select("id").single();

        if (calError) {
          console.error("[create_tentative_booking] Error:", calError);
          return respond({ success: false, error: calError.message });
        }

        // Create booking record
        await sb.from("bookings").insert({
          booking_date: date,
          start_time: startUtc.toISOString(),
          end_time: endUtc.toISOString(),
          guest_name: contactName,
          guest_email: contactEmail || "unknown@vapi.ai",
          guest_phone: contactPhone,
          meeting_type: isVideo ? "videography" : "web_consultation",
          duration_minutes: durationMinutes,
          status: "tentative",
          notes: `Tentative booking via AI call. Service: ${serviceType}. ${notes}`,
        });

        // Update customer meta with booking info
        if (contactId) {
          const { data: cust } = await sb.from("customers").select("meta").eq("id", contactId).single();
          const existingMeta = (cust?.meta as any) || {};
          await sb.from("customers").update({
            meta: {
              ...existingMeta,
              tentative_booking_date: startUtc.toISOString(),
              tentative_booking_conflict: hasConflict,
              tentative_booking_service: serviceType,
              tentative_booking_calendar_id: calEvent?.id,
            },
          }).eq("id", contactId);
        }

        // Link to existing deal
        if (contactId) {
          const { data: deal } = await sb.from("deals").select("id")
            .eq("customer_id", contactId).eq("status", "open").limit(1).maybeSingle();
          if (deal) {
            await sb.from("deals").update({ stage: "proposal" }).eq("id", deal.id);
          }
        }

        console.log(`[create_tentative_booking] Created for ${contactName} at ${startUtc.toISOString()}, conflict=${hasConflict}`);

        // Conflict notifications
        if (hasConflict) {
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`, "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "" },
              body: JSON.stringify({
                entity_type: "booking", action: "conflict",
                meta: { message: `⚠️ *BOOKING CONFLICT*\n\n${isVideo ? "📹" : "🌐"} Client: *${contactName}*\n📞 ${contactPhone || "N/A"}\n🕐 ${startUtc.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT\n\nReview in Calendar.` },
              }),
            });
          } catch (e) { console.error("Conflict notification failed:", e); }
        }

        return respond({
          success: true,
          booking_id: calEvent?.id,
          status: "tentative",
          has_conflict: hasConflict,
          date,
          time,
          message: hasConflict
            ? `Tentative booking created but there IS a conflict. Warren will review and confirm.`
            : `Tentative booking created for ${time} on ${date}. Warren will confirm shortly.`,
        });
      }

      // Unknown tool — return graceful error
      console.log("[vapi-webhook] Unknown tool:", fnName);
      return respond({ error: `Unknown tool: ${fnName}` });
    }

    // ════════════════════════════════════════════
    // PART 2: END-OF-CALL REPORT
    // ════════════════════════════════════════════
    if (messageType === "end-of-call-report") {
      const callId = message.call?.id;
      if (!callId) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const transcript = message.transcript || "";
      const summary = message.summary || "";
      const recordingUrl = message.recordingUrl || null;
      const endedReason = message.endedReason || "unknown";
      const assistantId = message.call?.assistantId || message.call?.assistant?.id || "";
      const customerPhone = normalizePhone(
        message.call?.customer?.number || message.customer?.number || ""
      );

      let duration = message.call?.duration || message.duration || 0;
      if (!duration && message.startedAt && message.endedAt)
        duration = (new Date(message.endedAt).getTime() - new Date(message.startedAt).getTime()) / 1000;
      if (!duration && message.call?.startedAt && message.call?.endedAt)
        duration = (new Date(message.call.endedAt).getTime() - new Date(message.call.startedAt).getTime()) / 1000;

      const hasContent = !!(transcript?.trim() || summary?.trim());
      const callFailed = !hasContent && (["assistant-error", "no-answer", "busy", "voicemail", "machine-detected", "customer-did-not-answer", "customer-busy", "silence-timed-out"].includes(endedReason) || duration < 15);
      const aiNotes = callFailed
        ? `AI Agent could not connect.\n• Reason: ${endedReason.replace(/-/g, " ")}\n• Duration: ${Math.round(duration)}s`
        : buildAINotes(transcript, summary, endedReason, duration, recordingUrl);

      // ─── Disposition analysis from transcript ───
      const lcTranscript = (transcript + " " + summary).toLowerCase();
      let disposition: "interested" | "not_interested" | "follow_up" | "booked" | "unknown" = "unknown";
      let followUpRequired = false;
      let nextActionDate: string | null = null;

      if (!callFailed && hasContent) {
        if (lcTranscript.match(/\b(not interested|no thanks|don't need|no need|wrong number|remove me)\b/))
          disposition = "not_interested";
        else if (lcTranscript.match(/\b(tentative|booked|scheduled|appointment|reserved)\b/))
          disposition = "booked";
        else if (lcTranscript.match(/\b(interested|sounds good|tell me more|like to|want to|need a|looking for|yes|sign me up)\b/))
          disposition = "interested";
        else if (lcTranscript.match(/\b(call (me )?back|follow up|later|tomorrow|next week|busy right now)\b/)) {
          disposition = "follow_up";
          followUpRequired = true;
          // Try to extract next action date
          if (lcTranscript.includes("tomorrow")) {
            const t = new Date(); t.setDate(t.getDate() + 1);
            nextActionDate = t.toISOString().split("T")[0];
          } else if (lcTranscript.includes("next week")) {
            const t = new Date(); t.setDate(t.getDate() + 7);
            nextActionDate = t.toISOString().split("T")[0];
          }
        }
        else disposition = "interested"; // default to interested if they talked
      }

      // ─── Map disposition to pipeline stage ───
      const stageMap: Record<string, string> = {
        interested: "contacted",
        booked: "scheduled",
        follow_up: "callback",
        not_interested: "dead",
        unknown: "lead",
      };
      const newStatus = callFailed ? "lead" : stageMap[disposition];

      // ─── Find the lead: try lw_landing_leads first, then customers ───
      const { data: llLead } = await sb.from("lw_landing_leads").select("*").eq("vapi_call_id", callId).single();

      if (llLead) {
        // Landing lead flow (existing logic preserved)
        await handleLandingLeadEndOfCall(sb, llLead, {
          transcript, summary, recordingUrl, endedReason, duration, callFailed, aiNotes,
          SUPABASE_URL, callId,
        });
      }

      // Always check customers table too (direct-dial leads)
      const funnel = getAssistantFunnel(assistantId, message?.call || payload?.call);
      const customerLead = await findBestCustomerMatch(sb, {
        callId,
        phone: customerPhone,
        source: funnel?.source || null,
      });
      if (!customerLead) console.log(`[end-of-call] No customer found for call ${callId}, phone=${customerPhone}`);

      if (customerLead) {
        const existingMeta = (customerLead.meta as any) || {};
        const existingTags = Array.isArray(customerLead.tags) ? (customerLead.tags as string[]) : [];
        
        // Remove "in_call" tag, add disposition tags
        const nextTags = Array.from(new Set([
          ...existingTags.filter(t => t !== "in_call"),
          ...(disposition !== "unknown" ? [`disposition_${disposition}`] : []),
          ...(followUpRequired ? ["follow_up_needed"] : []),
        ]));

        // Build session entry for call history
        const custSessionEntry = {
          call_id: callId,
          date: new Date().toISOString(),
          status: callFailed ? "no_answer" : "completed",
          recording_url: recordingUrl,
          transcript,
          summary,
          ai_notes: aiNotes,
          ended_reason: endedReason,
          duration_seconds: duration,
          disposition,
        };
        const prevCustSessions = Array.isArray(existingMeta?.vapi_call_sessions) ? existingMeta.vapi_call_sessions : [];

        await sb.from("customers").update({
          status: newStatus,
          tags: nextTags,
          notes: (customerLead.notes || "") + "\n\n--- AI Call Report ---\n" + aiNotes,
          meta: {
            ...existingMeta,
            funnel_drafted_at: null,
            vapi_call_status: callFailed ? "no_answer" : "completed",
            vapi_transcript: transcript,
            vapi_summary: summary,
            vapi_recording_url: recordingUrl,
            vapi_ended_reason: endedReason,
            vapi_duration_seconds: duration,
            vapi_ai_notes: aiNotes,
            vapi_disposition: disposition,
            vapi_follow_up_required: followUpRequired,
            vapi_next_action_date: nextActionDate,
            vapi_last_contact: new Date().toISOString(),
            vapi_call_sessions: [...prevCustSessions, custSessionEntry],
          },
        }).eq("id", customerLead.id);

        console.log(`[end-of-call] Updated customer ${customerLead.id}: status=${newStatus}, disposition=${disposition}`);

        // Clear stale in_call on any OTHER customers that share this call_id
        const { data: dupes } = await sb.from("customers").select("id, meta")
          .filter("meta->>vapi_call_id", "eq", callId)
          .neq("id", customerLead.id);
        if (dupes?.length) {
          for (const d of dupes) {
            const dm = (d.meta as any) || {};
            await sb.from("customers").update({
              meta: { ...dm, vapi_call_status: "completed", vapi_last_contact: new Date().toISOString() },
              tags: Array.isArray((d as any).tags) ? (d as any).tags.filter((t: string) => t !== "in_call") : [],
            }).eq("id", d.id);
            console.log(`[end-of-call] Cleared stale in_call on duplicate customer ${d.id}`);
          }
        }

        // Log to communications table for audit trail
        await sb.from("communications").insert({
          customer_id: customerLead.id,
          type: "call",
          direction: "inbound",
          status: callFailed ? "failed" : "completed",
          body: transcript || summary || aiNotes,
          subject: `AI Call — ${disposition}`,
          duration_seconds: Math.round(duration),
          provider: "vapi",
          external_id: callId,
          metadata: {
            assistant_id: assistantId,
            disposition,
            recording_url: recordingUrl,
            ended_reason: endedReason,
            follow_up_required: followUpRequired,
            next_action_date: nextActionDate,
          },
        });

        // ─── Discord: Send "Call Ended" notification with transcript + recording buttons ───
        if (funnel) {
          try {
            const callerName = customerLead.full_name && !isPlaceholderLeadName(customerLead.full_name)
              ? customerLead.full_name
              : `Direct Caller (${customerPhone || "Unknown"})`;
            const endNotifyBody = {
              event: "call_ended",
              category: funnel.tag,
              name: callerName,
              phone: customerPhone || customerLead.phone || "Unknown",
              email: customerLead.email || null,
              customerId: customerLead.id,
              callId,
              recordingUrl: recordingUrl || null,
              summary: summary || null,
              transcriptText: transcript || null,
              duration,
              disposition,
              notes: callFailed
                ? `⚠️ Call did not connect. Reason: ${endedReason}`
                : `📞 Call complete — ${disposition}.`,
              extra: {
                "Ended Reason": endedReason,
                "Call ID": callId,
              },
            };
            let endNotifyOk = false;
            try {
              const { error: endInvokeErr } = await sb.functions.invoke("discord-lead-notify", { body: endNotifyBody });
              if (endInvokeErr) throw endInvokeErr;
              endNotifyOk = true;
              console.log(`[end-of-call] Discord 'call_ended' notify sent for call ${callId}`);
            } catch (endNotifyErr) {
              console.error("[end-of-call] Discord invoke failed, using direct webhook fallback:", endNotifyErr);
            }
            if (!endNotifyOk) {
              try {
                const DIRECT_WEBHOOK = "https://discord.com/api/webhooks/1496195405199835388/TSjesn8TtD3RV6TJtcWXT7UyfXJ4mkmo3jFRXhUbaC_bIhj5lBsXPn0CUWTVYiSjM__F";
                const MENTION_USER_ID = "1044533644347330580";
                const transcriptHref = `${SUPABASE_URL}/functions/v1/call-transcript?call_id=${encodeURIComponent(callId)}`;
                const recordingHref = recordingUrl || `${SUPABASE_URL}/functions/v1/call-transcript?call_id=${encodeURIComponent(callId)}&include=recording`;
                const notesHref = `https://stu25.com/customers?customer=${encodeURIComponent(customerLead.id)}`;
                const summaryClip = (summary || transcript || "").slice(0, 900);
                const fallbackPayload = {
                  content: `<@${MENTION_USER_ID}> 📞 **${funnel.label}** call ended — review below.`,
                  allowed_mentions: { users: [MENTION_USER_ID] },
                  embeds: [{
                    title: `✅ Call Ended — ${funnel.label}`,
                    description: `Call with **${callerName}** just wrapped.`,
                    color: funnel.tag === "web" ? 0x3b82f6 : 0xa855f7,
                    fields: [
                      { name: "Phone (tap to copy)", value: customerPhone ? `\`${customerPhone}\` · [📞 Call](tel:${customerPhone.replace(/[^\d+]/g, "")})` : "Unknown", inline: true },
                      { name: "Disposition", value: disposition, inline: true },
                      ...(summaryClip ? [{ name: "Summary", value: summaryClip, inline: false }] : []),
                      { name: "Call ID", value: callId, inline: false },
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: "Warren Guru • Call Ended (fallback)" },
                  }],
                  components: [{
                    type: 1,
                    components: [
                      { type: 2, style: 5, label: "📄 Download Transcript", url: transcriptHref },
                      { type: 2, style: 5, label: "🎧 Listen to Recording", url: recordingHref },
                      { type: 2, style: 5, label: "📒 View Caller Notes", url: notesHref },
                    ],
                  }],
                };
                const dRes = await fetch(DIRECT_WEBHOOK, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(fallbackPayload),
                });
                if (!dRes.ok) console.error("[end-of-call] Direct Discord webhook failed:", dRes.status, await dRes.text());
                else console.log(`[end-of-call] Discord 'call_ended' direct fallback sent for call ${callId}`);
              } catch (dErr) {
                console.error("[end-of-call] Direct Discord webhook threw:", dErr);
              }
            }
          } catch (notifyErr) {
            console.error("[end-of-call] Discord call_ended notify error:", notifyErr);
          }
        }

        // ─── Videography: Auto-create tentative booking from transcript ───
        const isVideography = customerLead.source === "videography-landing";
        if (isVideography && !callFailed) {
          try {
            const scheduledDate = extractScheduleFromTranscript(transcript, summary);
            if (scheduledDate) {
              await createVideoBookingFromTranscript(sb, customerLead, scheduledDate, aiNotes, callId, SUPABASE_URL);
            }
          } catch (bookingErr) {
            console.error("[end-of-call] Video booking creation failed:", bookingErr);
          }
        }
      }

      // If neither found, and we have a phone, create a new lead
      if (!llLead && !customerLead && customerPhone) {
        const funnel = getAssistantFunnel(assistantId, message?.call || payload?.call);
        if (funnel) {
          const { error: insertError } = await sb.from("customers").insert({
            full_name: `Caller (${customerPhone})`,
            phone: customerPhone,
            source: funnel.source,
            category: funnel.category,
            status: newStatus,
            notes: aiNotes,
            tags: ["vapi_inbound_call", funnel.tag, ...(disposition !== "unknown" ? [`disposition_${disposition}`] : [])],
            meta: {
              vapi_call_id: callId,
              vapi_call_status: callFailed ? "no_answer" : "completed",
              vapi_assistant_id: assistantId,
              vapi_transcript: transcript,
              vapi_summary: summary,
              vapi_recording_url: recordingUrl,
              vapi_ended_reason: endedReason,
              vapi_duration_seconds: duration,
              vapi_ai_notes: aiNotes,
              vapi_disposition: disposition,
              vapi_follow_up_required: followUpRequired,
              vapi_next_action_date: nextActionDate,
              vapi_last_contact: new Date().toISOString(),
              vapi_direct_dial: true,
            },
          });
          if (insertError) console.error("[end-of-call] New lead insert error:", insertError);
          else console.log(`[end-of-call] Created new ${funnel.tag} lead from end-of-call for ${customerPhone}`);
        }
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ════════════════════════════════════════════
    // PART 3: STATUS UPDATES (in-call tracking)
    // ════════════════════════════════════════════
    if (messageType === "status-update") {
      const call = message?.call || payload?.call || {};
      const callId = call?.id || payload?.callId || "";
      const rawStatus = String(message?.status || call?.status || payload?.status || "").trim().toLowerCase();
      const assistantId = String(call?.assistantId || call?.assistant?.id || message?.assistantId || message?.assistant?.id || payload?.assistantId || "").trim();
      const customerPhone = normalizePhone(
        [call?.customer?.number, call?.phoneNumber?.number, typeof call?.phoneNumber === "string" ? call?.phoneNumber : "",
         message?.customer?.number, message?.customerNumber, payload?.customer?.number, payload?.customerNumber]
          .find((v) => typeof v === "string" && v.trim().length > 0) || ""
      );

      const mapCallStatus = (v: string) => {
        if (["in-progress", "in_progress", "active", "started", "ongoing"].includes(v)) return "in_call";
        if (["queued", "ringing"].includes(v)) return "calling";
        if (["ended", "completed"].includes(v)) return "completed";
        if (["failed", "no-answer", "no_answer", "busy", "cancelled", "canceled"].includes(v)) return "no_answer";
        return v || null;
      };
      const mappedStatus = mapCallStatus(rawStatus);

      if (callId && mappedStatus) {
        console.log(`[status-update] call=${callId} raw=${rawStatus} mapped=${mappedStatus} assistant=${assistantId} phone=${customerPhone}`);

          const funnel = getAssistantFunnel(assistantId, message?.call || payload?.call);
          const custByCall = await findBestCustomerMatch(sb, {
            callId,
            phone: customerPhone,
            source: funnel?.source || null,
          });

          // ──── Real-time Discord notification when call starts ────
          if ((mappedStatus === "in_call" || mappedStatus === "calling") && funnel) {
            const notifyKey = `discord_notified_${callId}`;
            const alreadyNotified = (custByCall?.meta as any)?.[notifyKey];
            if (!alreadyNotified) {
              const callerName = custByCall?.full_name && !isPlaceholderLeadName(custByCall.full_name)
                ? custByCall.full_name
                : `Direct Caller (${customerPhone || "Unknown"})`;
              const notifyBody = {
                category: funnel.tag,
                name: callerName,
                phone: customerPhone || "Unknown",
                email: custByCall?.email || null,
                notes: `📞 Live inbound call in progress on the ${funnel.label} AI line.`,
                extra: {
                  "Call Status": mappedStatus === "in_call" ? "🟢 LIVE — On Call Now" : "📞 Ringing",
                  "Call ID": callId,
                },
              };

              let notifyOk = false;
              try {
                const { error: invokeErr } = await sb.functions.invoke("discord-lead-notify", { body: notifyBody });
                if (invokeErr) throw invokeErr;
                notifyOk = true;
                console.log(`[status-update] Discord notify (invoke) sent for ${funnel.tag} call ${callId}`);
              } catch (notifyErr) {
                console.error("[status-update] Discord invoke failed, falling back to direct webhook:", notifyErr);
              }

              // Fallback: post directly to Discord webhook so we never miss a live call
              if (!notifyOk) {
                try {
                  const DIRECT_WEBHOOK = "https://discord.com/api/webhooks/1496195405199835388/TSjesn8TtD3RV6TJtcWXT7UyfXJ4mkmo3jFRXhUbaC_bIhj5lBsXPn0CUWTVYiSjM__F";
                  const MENTION_USER_ID = "1044533644347330580";
                  const fallbackPayload = {
                    content: `<@${MENTION_USER_ID}> 🚨 LIVE **${funnel.label}** call right now!`,
                    allowed_mentions: { users: [MENTION_USER_ID] },
                    embeds: [{
                      title: `📞 Live Call — ${funnel.label}`,
                      description: `**${callerName}** is on the ${funnel.label} AI line.`,
                      color: funnel.tag === "web" ? 0x3b82f6 : 0xa855f7,
                      fields: [
                        { name: "Phone (tap to copy)", value: customerPhone ? `\`${customerPhone}\` · [📞 Call](tel:${customerPhone.replace(/[^\d+]/g, "")})` : "Unknown", inline: true },
                        { name: "Call ID", value: callId, inline: false },
                      ],
                      timestamp: new Date().toISOString(),
                      footer: { text: "Warren Guru • Live Call (fallback)" },
                    }],
                  };
                  const dRes = await fetch(DIRECT_WEBHOOK, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(fallbackPayload),
                  });
                  if (dRes.ok) {
                    notifyOk = true;
                    console.log(`[status-update] Discord notify (direct fallback) sent for call ${callId}`);
                  } else {
                    console.error("[status-update] Direct Discord webhook failed:", dRes.status, await dRes.text());
                  }
                } catch (fallbackErr) {
                  console.error("[status-update] Direct Discord webhook threw:", fallbackErr);
                }
              }

              if (notifyOk && custByCall) {
                const em = (custByCall.meta as any) || {};
                await sb.from("customers").update({
                  meta: { ...em, [notifyKey]: new Date().toISOString() },
                }).eq("id", custByCall.id);
              }
            }
          }

        // Update lw_landing_leads
        await sb.from("lw_landing_leads").update({ vapi_call_status: mappedStatus }).eq("vapi_call_id", callId);

        if (custByCall && mappedStatus !== "completed") {
          // Skip meta update on "ended/completed" — end-of-call-report will write the final state
          const em = (custByCall.meta as any) || {};
          await sb.from("customers").update({
            meta: { ...em, vapi_call_status: mappedStatus, vapi_assistant_id: em.vapi_assistant_id || assistantId, vapi_raw_status: rawStatus },
          }).eq("id", custByCall.id);
        }

        // Direct-dial lead creation/update
        // Skip when call ended — end-of-call-report handles final enrichment with transcript/recording
        if (funnel && (assistantId === WEB_INBOUND_ID || assistantId === VIDEO_INBOUND_ID) && mappedStatus !== "completed") {
          let directLead = custByCall;

          if (!directLead && customerPhone) {
            directLead = await findBestCustomerMatch(sb, {
              callId,
              phone: customerPhone,
              source: funnel.source,
            });
          }

          const em = (directLead?.meta as any) || {};
          const et = Array.isArray(directLead?.tags) ? (directLead.tags as string[]) : [];
          const nextTags = Array.from(new Set([
            ...et.filter((tag) => tag !== "in_call"), `${funnel.tag}_direct_call`, "vapi_direct",
            ...(mappedStatus === "in_call" || mappedStatus === "calling" ? ["in_call"] : []),
          ]));
          const nextMeta = {
            ...em,
            vapi_call_id: callId,
            vapi_call_status: mappedStatus,
            vapi_assistant_id: assistantId,
            vapi_direct_dial: true,
            vapi_call_started_at: mappedStatus === "in_call" || mappedStatus === "calling"
              ? new Date().toISOString()
              : (em.vapi_call_started_at || new Date().toISOString()),
            vapi_last_contact: new Date().toISOString(),
            vapi_raw_status: rawStatus,
            funnel_drafted_at: null,
          };

          if (directLead) {
            await sb.from("customers").update({
              phone: directLead.phone || customerPhone || null,
              status: mappedStatus === "in_call" ? "lead" : directLead.status || "lead",
              tags: nextTags,
              meta: nextMeta,
              notes: directLead.notes || `Direct inbound call via ${funnel.label} AI line.`,
            }).eq("id", directLead.id);
            console.log(`[status-update] Updated ${funnel.tag} direct-call lead ${directLead.id}`);
          } else {
            const { error } = await sb.from("customers").insert({
              full_name: `Direct Caller (${customerPhone || "Unknown"})`,
              phone: customerPhone || null,
              source: funnel.source, category: funnel.category, status: "lead",
              notes: `Direct inbound call via ${funnel.label} AI line.`,
              tags: nextTags, meta: nextMeta,
            });
            if (error) console.error(`[status-update] Insert error:`, error);
            else console.log(`[status-update] Created ${funnel.tag} direct-call lead for ${customerPhone}`);
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("vapi-webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// ════════════════════════════════════════════
// HELPER: Handle landing lead end-of-call (existing logic)
// ════════════════════════════════════════════
async function handleLandingLeadEndOfCall(
  sb: any, lead: any,
  opts: { transcript: string; summary: string; recordingUrl: string | null; endedReason: string; duration: number; callFailed: boolean; aiNotes: string; SUPABASE_URL: string; callId: string }
) {
  const { transcript, summary, recordingUrl, endedReason, duration, callFailed, aiNotes, SUPABASE_URL, callId } = opts;

  // Cost tracking
  const costBreakdown = 0; // message.cost handled upstream
  const callCostCents = 0;

  const prevRetryCount = (lead.meta as any)?.vapi_retry_count ?? 0;

  // Build session entry for call history
  const sessionEntry = {
    call_id: callId,
    date: new Date().toISOString(),
    status: callFailed ? "no_answer" : "completed",
    recording_url: recordingUrl,
    transcript,
    summary,
    ai_notes: aiNotes,
    ended_reason: endedReason,
    duration_seconds: duration,
  };
  const prevSessions = Array.isArray((lead.meta as any)?.vapi_call_sessions) ? (lead.meta as any).vapi_call_sessions : [];

  await sb.from("lw_landing_leads").update({
    vapi_call_status: callFailed ? "no_answer" : "completed",
    ai_notes: aiNotes,
    vapi_recording_url: recordingUrl,
    meta: {
      ...(lead.meta as any),
      vapi_transcript: transcript,
      vapi_summary: summary,
      vapi_recording_url: recordingUrl,
      vapi_ended_reason: endedReason,
      vapi_duration_seconds: duration,
      vapi_retry_count: callFailed ? prevRetryCount + 1 : prevRetryCount,
      vapi_last_retry_at: callFailed ? new Date().toISOString() : (lead.meta as any)?.vapi_last_retry_at,
      vapi_call_sessions: [...prevSessions, sessionEntry],
    },
  }).eq("id", lead.id);

  // Auto-retry for landing leads
  if (callFailed && prevRetryCount < 2) {
    console.log(`[landing-lead] Call failed (${endedReason}), retry #${prevRetryCount + 1}`);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/vapi-outbound`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`, "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "" },
        body: JSON.stringify({ action: "trigger_call", lead_id: lead.id }),
      });
    } catch (e) { console.error("Retry failed:", e); }
  }

  // Email notification (only if not retrying)
  const willRetry = callFailed && prevRetryCount < 2;
  if (lead.landing_page_id && !willRetry) {
    const { data: landingPage } = await sb.from("lw_landing_pages")
      .select("client_name, email, phone, accent_color, slug").eq("id", lead.landing_page_id).single();

    if (landingPage?.email) {
      const updatedLead = { ...lead, ai_notes: aiNotes };
      const subject = callFailed
        ? `🏠 New Lead: ${lead.full_name} — AI Agent Did Not Connect`
        : `🏠 New Lead: ${lead.full_name} — AI Call Completed`;
      const html = buildLeadEmailHtml(updatedLead, landingPage, !callFailed);
      try { await sendGmailNotification(landingPage.email, subject, html); }
      catch (e) { console.error("Email failed:", e); }
    }
  }

  console.log("Updated landing lead", lead.id);
}

// ════════════════════════════════════════════
// HELPER: Create videography booking from transcript
// ════════════════════════════════════════════
async function createVideoBookingFromTranscript(
  sb: any, customer: any, scheduledDate: string, aiNotes: string, callId: string, SUPABASE_URL: string
) {
  const eventStart = new Date(scheduledDate);
  const eventEnd = new Date(eventStart.getTime() + 2 * 60 * 60 * 1000);

  // Check blocked slots
  const pstOffset = -7;
  const pstHour = (eventStart.getUTCHours() + pstOffset + 24) % 24;
  const pstMin = eventStart.getUTCMinutes();
  const pstTime = pstHour + pstMin / 60;
  const endPstHour = (eventEnd.getUTCHours() + pstOffset + 24) % 24;
  const endPstTime = endPstHour + eventEnd.getUTCMinutes() / 60;
  const hitsBlockedSlot = BLOCKED_SLOTS.some(slot => {
    const s = slot.startH + slot.startM / 60;
    const e = slot.endH + slot.endM / 60;
    return pstTime < e && endPstTime > s;
  });

  const { data: conflicts } = await sb.from("calendar_events").select("id, title, start_time, end_time")
    .lt("start_time", eventEnd.toISOString()).gt("end_time", eventStart.toISOString());
  const hasConflict = (conflicts && conflicts.length > 0) || hitsBlockedSlot;

  const eventTitle = `📹 ${hasConflict ? "⚠️ CONFLICT — " : ""}Videography: ${customer.full_name}`;
  await sb.from("calendar_events").insert({
    title: eventTitle,
    description: `Tentative videography booking from AI call.\n\nClient: ${customer.full_name}\nPhone: ${customer.phone || "N/A"}\nEmail: ${customer.email || "N/A"}\n\n${hasConflict ? "⚠️ CONFLICT. Review needed." : "No conflicts."}\n\nAI Notes:\n${aiNotes}`,
    start_time: eventStart.toISOString(), end_time: eventEnd.toISOString(),
    category: "videography", source: "vapi-ai", source_id: callId,
    customer_id: customer.id, color: hasConflict ? "#ef4444" : "#8b5cf6",
    location: "TBD — confirm with client",
  });

  // Update customer meta without clobbering the final end-of-call fields
  const { data: latestCustomer } = await sb.from("customers").select("meta").eq("id", customer.id).maybeSingle();
  const latestMeta = (latestCustomer?.meta as any) || {};
  await sb.from("customers").update({
    meta: { ...latestMeta, videography_tentative_date: eventStart.toISOString(), videography_booking_conflict: hasConflict },
  }).eq("id", customer.id);

  console.log(`[video-booking] Created for ${customer.full_name}, conflict=${hasConflict}`);

  if (hasConflict) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`, "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "" },
        body: JSON.stringify({
          entity_type: "videography_booking", action: "conflict",
          meta: { message: `⚠️ *VIDEO BOOKING CONFLICT*\n📹 Client: *${customer.full_name}*\n📞 ${customer.phone || "N/A"}\n🕐 ${eventStart.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT` },
        }),
      });
    } catch (e) { console.error("Conflict notification failed:", e); }
  }
}

// ════════════════════════════════════════════
// HELPER: Build AI notes from transcript
// ════════════════════════════════════════════
function buildAINotes(transcript: string, summary: string, endedReason: string, duration: number, recordingUrl: string | null): string {
  const lines: string[] = ["AI Notes:", ""];
  if (summary) lines.push("• Call Summary: " + summary);
  lines.push(`• Call Duration: ${Math.round(duration)}s`);
  lines.push(`• Call Outcome: ${endedReason.replace(/-/g, " ")}`);
  if (recordingUrl) lines.push(`• Recording: ${recordingUrl}`);

  if (transcript) {
    const lcTranscript = transcript.toLowerCase();
    const isVideographyCall = lcTranscript.includes("livestream") || lcTranscript.includes("live stream") ||
      lcTranscript.includes("vivian") || lcTranscript.includes("videography") ||
      lcTranscript.includes("funeral") || lcTranscript.includes("memorial") || lcTranscript.includes("graveside");

    if (isVideographyCall) {
      const serviceTypes = ["funeral", "memorial", "graveside", "multiple locations", "celebration of life", "viewing", "wake", "repast"];
      const foundTypes = serviceTypes.filter(t => lcTranscript.includes(t));
      if (foundTypes.length) lines.push(`• Service Type: ${foundTypes.join(", ")}`);
      const durMatch = transcript.match(/(?:about\s*)?(\w+)\s*hours?/i);
      if (durMatch) lines.push(`• Estimated Duration: ${durMatch[0].trim()}`);
      const addrMatch = transcript.match(/(?:address|held|location)[^.]*?(\d+\s+[\w\s]+(?:lane|street|drive|road|ave|avenue|blvd|boulevard|way|court|ct|pl|place|circle|cir|parkway|pkwy|trail|trl))/i);
      if (addrMatch) lines.push(`• Venue Address: ${addrMatch[1].trim()}`);
      const contactMatch = transcript.match(/(?:this\s*is\s*(?:me,?\s*)?|my\s*name\s*is\s*|name\s*is\s*)([A-Z][a-z]+\s+[A-Z][a-z]+)/);
      if (contactMatch) lines.push(`• Contact Name: ${contactMatch[1].trim()}`);
    } else {
      const conditionPatterns = [
        { pattern: /(?:major|significant)\s*repair/i, value: "Major repairs needed" },
        { pattern: /needs?\s*(?:some\s*)?work/i, value: "Needs work" },
        { pattern: /(?:good|great|excellent)\s*(?:condition|shape)/i, value: "Good condition" },
      ];
      for (const { pattern, value } of conditionPatterns) { if (pattern.test(transcript)) { lines.push(`• Property Condition: ${value}`); break; } }
      const timelinePatterns = [
        { pattern: /asap|as\s*soon\s*as\s*possible|immediately/i, value: "ASAP" },
        { pattern: /(?:1|one|two|2|three|3)\s*months?/i, value: "1-3 months" },
        { pattern: /flexible|no\s*rush/i, value: "Flexible" },
      ];
      for (const { pattern, value } of timelinePatterns) { if (pattern.test(transcript)) { lines.push(`• Selling Timeline: ${value}`); break; } }
      const motivationPatterns = [
        { pattern: /downsize/i, value: "Downsizing" }, { pattern: /relocat|moving/i, value: "Relocation" },
        { pattern: /financ|foreclosure/i, value: "Financial hardship" }, { pattern: /inherit/i, value: "Inherited" },
      ];
      for (const { pattern, value } of motivationPatterns) { if (pattern.test(transcript)) { lines.push(`• Motivation: ${value}`); break; } }
      const priceMatch = transcript.match(/\$[\d,]+(?:\.\d{2})?|\b(\d{2,3})\s*(?:thousand|k)\b/i);
      if (priceMatch) lines.push(`• Price Mentioned: ${priceMatch[0]}`);
    }

    const emailMatch = transcript.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) lines.push(`• Email Captured: ${emailMatch[0]}`);
  }

  return lines.join("\n");
}

function buildLeadEmailHtml(lead: any, landingPage: any, aiConnected: boolean): string {
  const accentColor = landingPage?.accent_color || "#10b981";
  const clientName = landingPage?.client_name || "Your Brand";
  const aiSection = aiConnected && lead.ai_notes
    ? `<div style="background:#f0fdf4;border-left:4px solid ${accentColor};padding:16px;margin:16px 0;border-radius:4px;"><h3 style="margin:0 0 8px;color:#065f46;">✅ AI Call Notes</h3><pre style="margin:0;white-space:pre-wrap;font-family:inherit;color:#1f2937;font-size:14px;">${escapeHtml(lead.ai_notes)}</pre></div>`
    : `<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px;margin:16px 0;border-radius:4px;"><h3 style="margin:0 0 8px;color:#92400e;">⚠️ AI Did Not Connect</h3><p style="margin:0;color:#78350f;">Please follow up manually.</p></div>`;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="background:#000;padding:24px 32px;"><h1 style="margin:0;color:#fff;font-size:22px;">🏠 New Lead — ${escapeHtml(clientName)}</h1></div><div style="padding:24px 32px;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><tr><td style="padding:8px 0;color:#6b7280;">Name</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(lead.full_name)}</td></tr><tr><td style="padding:8px 0;color:#6b7280;">Phone</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(lead.phone)}</td></tr>${lead.email ? `<tr><td style="padding:8px 0;color:#6b7280;">Email</td><td>${escapeHtml(lead.email)}</td></tr>` : ""}</table>${aiSection}</div></div></body></html>`;
}

function extractScheduleFromTranscript(transcript: string, summary: string): string | null {
  const text = `${summary}\n${transcript}`.toLowerCase();
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const monthAbbr = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const monthDayMatch = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  let dateStr: string | null = null;

  if (monthDayMatch) {
    const mName = monthDayMatch[1];
    const day = parseInt(monthDayMatch[2]);
    const mIdx = months.indexOf(mName) !== -1 ? months.indexOf(mName) : monthAbbr.indexOf(mName);
    if (mIdx !== -1 && day >= 1 && day <= 31) {
      const now = new Date(); let year = now.getFullYear();
      const candidate = new Date(year, mIdx, day);
      if (candidate < now) candidate.setFullYear(year + 1);
      dateStr = candidate.toISOString().split("T")[0];
    }
  }

  if (!dateStr) {
    const slashMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (slashMatch) {
      const m = parseInt(slashMatch[1]), d = parseInt(slashMatch[2]);
      let y = slashMatch[3] ? parseInt(slashMatch[3]) : new Date().getFullYear();
      if (y < 100) y += 2000;
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        const candidate = new Date(y, m - 1, d);
        if (candidate < new Date()) candidate.setFullYear(candidate.getFullYear() + 1);
        dateStr = candidate.toISOString().split("T")[0];
      }
    }
  }

  if (!dateStr) {
    const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const relMatch = text.match(/\b(?:this|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (relMatch) {
      const targetDay = days.indexOf(relMatch[1]);
      const now = new Date(); const currentDay = now.getDay();
      let daysAhead = targetDay - currentDay;
      if (daysAhead <= 0) daysAhead += 7;
      if (text.includes("next") && daysAhead <= 7) daysAhead += 7;
      const target = new Date(now); target.setDate(target.getDate() + daysAhead);
      dateStr = target.toISOString().split("T")[0];
    }
  }

  if (!dateStr && text.includes("tomorrow")) {
    const t = new Date(); t.setDate(t.getDate() + 1);
    dateStr = t.toISOString().split("T")[0];
  }

  if (!dateStr) return null;

  const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/);
  let hours = 10, minutes = 0;
  if (timeMatch) {
    hours = parseInt(timeMatch[1]); minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const period = timeMatch[3].replace(/\./g, "");
    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
  }

  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hours + 7, minutes)).toISOString();
}
