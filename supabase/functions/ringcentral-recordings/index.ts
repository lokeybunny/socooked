/**
 * RingCentral Recordings — Fetches call recordings for a customer by phone number
 * Authenticates via JWT, downloads recordings to Supabase storage, logs in communications table
 * 
 * Actions:
 *   - "pull" (default): Pull recordings for a single customer { customer_id }
 *   - "backfill": Pull recordings for all current prospects
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bot-secret",
};

const BUCKET = "content-uploads";

/** Authenticate with RingCentral using JWT grant */
async function getRCAccessToken(): Promise<string> {
  const clientId = Deno.env.get("RINGCENTRAL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("RINGCENTRAL_CLIENT_SECRET")!;
  const jwtToken = Deno.env.get("RINGCENTRAL_JWT_TOKEN")!;

  const res = await fetch("https://platform.ringcentral.com/restapi/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwtToken,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`RC auth failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.access_token;
}

/** Normalize phone to E.164 for RC API queries */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits : `1${digits}`;
  return `+${normalized}`;
}

/** Normalize phone to 10-digit for matching */
function normalize10(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/** Fetch call log entries with recordings for a phone number */
async function fetchCallRecordings(
  accessToken: string,
  phoneNumber: string,
): Promise<any[]> {
  const e164 = toE164(phoneNumber);
  const recordings: any[] = [];

  // Search last 90 days of call logs
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 90);

  const params = new URLSearchParams({
    phoneNumber: e164,
    type: "Voice",
    withRecording: "true",
    dateFrom: dateFrom.toISOString(),
    perPage: "100",
    view: "Detailed",
  });

  const res = await fetch(
    `https://platform.ringcentral.com/restapi/v1.0/account/~/call-log?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(`RC call-log fetch failed (${res.status}): ${errText.slice(0, 200)}`);
    return [];
  }

  const data = await res.json();
  for (const record of data.records || []) {
    if (record.recording?.contentUri) {
      recordings.push({
        rc_id: record.id,
        direction: record.direction?.toLowerCase() || "unknown",
        from: record.from?.phoneNumber || null,
        to: record.to?.phoneNumber || null,
        duration: record.duration || 0,
        startTime: record.startTime || null,
        recordingId: record.recording?.id,
        contentUri: record.recording?.contentUri,
        contentType: record.recording?.contentType || "audio/mpeg",
      });
    }
  }

  return recordings;
}

/** Download a single recording and upload to Supabase storage */
async function downloadAndStore(
  accessToken: string,
  recording: any,
  customerName: string,
  sb: ReturnType<typeof createClient>,
): Promise<string | null> {
  try {
    const res = await fetch(`${recording.contentUri}?access_token=${accessToken}`);
    if (!res.ok) {
      console.error(`Failed to download recording ${recording.rc_id}: ${res.status}`);
      return null;
    }

    const blob = await res.blob();
    const ext = recording.contentType?.includes("wav") ? "wav" : "mp3";
    const safeName = customerName.replace(/[^a-zA-Z0-9-_]/g, "_");
    const dateStr = recording.startTime
      ? new Date(recording.startTime).toISOString().slice(0, 10)
      : "unknown";
    const fileName = `${dateStr}_${recording.direction}_${recording.rc_id}.${ext}`;
    const path = `recordings/${safeName}/ringcentral/${fileName}`;

    const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
      contentType: recording.contentType || "audio/mpeg",
      cacheControl: "3600",
      upsert: true,
    });

    if (error) {
      console.error(`Storage upload failed for ${recording.rc_id}: ${error.message}`);
      return null;
    }

    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (e: any) {
    console.error(`Download error for ${recording.rc_id}: ${e.message}`);
    return null;
  }
}

/** Process recordings for a single customer */
async function processCustomer(
  customer: { id: string; full_name: string; phone: string },
  accessToken: string,
  sb: ReturnType<typeof createClient>,
): Promise<{ pulled: number; skipped: number }> {
  const phone10 = normalize10(customer.phone);
  if (!phone10 || phone10.length !== 10) {
    return { pulled: 0, skipped: 0 };
  }

  const recordings = await fetchCallRecordings(accessToken, phone10);
  let pulled = 0;
  let skipped = 0;

  for (const rec of recordings) {
    // Check if we already have this recording
    const { data: existing } = await sb
      .from("communications")
      .select("id")
      .eq("external_id", `rc_recording_${rec.rc_id}`)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    const publicUrl = await downloadAndStore(accessToken, rec, customer.full_name, sb);
    if (!publicUrl) continue;

    await sb.from("communications").insert({
      customer_id: customer.id,
      type: "recording",
      direction: rec.direction === "inbound" ? "inbound" : "outbound",
      status: "completed",
      provider: "ringcentral",
      external_id: `rc_recording_${rec.rc_id}`,
      from_address: rec.from || null,
      to_address: rec.to || null,
      phone_number: phone10,
      duration_seconds: rec.duration || null,
      subject: `Call Recording — ${rec.direction} (${new Date(rec.startTime).toLocaleDateString()})`,
      body: publicUrl,
      metadata: {
        recording_url: publicUrl,
        rc_recording_id: rec.recordingId,
        rc_call_id: rec.rc_id,
        start_time: rec.startTime,
        content_type: rec.contentType,
      },
    });

    pulled++;
  }

  return { pulled, skipped };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "pull";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Authenticate with RingCentral
    const accessToken = await getRCAccessToken();

    if (action === "pull") {
      const { customer_id } = body;
      if (!customer_id) {
        return new Response(
          JSON.stringify({ error: "customer_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: customer } = await sb
        .from("customers")
        .select("id, full_name, phone")
        .eq("id", customer_id)
        .single();

      if (!customer || !customer.phone) {
        return new Response(
          JSON.stringify({ error: "Customer not found or has no phone number" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const result = await processCustomer(customer, accessToken, sb);

      return new Response(
        JSON.stringify({
          success: true,
          customer: customer.full_name,
          ...result,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "backfill") {
      const { data: prospects } = await sb
        .from("customers")
        .select("id, full_name, phone")
        .eq("status", "prospect")
        .not("phone", "is", null)
        .neq("phone", "");

      const results: any[] = [];
      for (const customer of prospects || []) {
        const result = await processCustomer(customer, accessToken, sb);
        results.push({ customer: customer.full_name, ...result });
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("RC Recordings error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
