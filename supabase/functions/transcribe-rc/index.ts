import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RC_SERVER = "https://platform.ringcentral.com";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getRCToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const clientId = Deno.env.get("RINGCENTRAL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("RINGCENTRAL_CLIENT_SECRET")!;
  const jwtToken = Deno.env.get("RINGCENTRAL_JWT_TOKEN")!;
  const res = await fetch(`${RC_SERVER}/restapi/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwtToken,
    }),
  });
  if (!res.ok) throw new Error(`RC auth failed: ${res.status}`);
  const data: TokenResponse = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function rcGet(path: string, token: string) {
  const res = await fetch(`${RC_SERVER}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`RC API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function transcribeText(text: string): Promise<{ transcript: string; summary: string }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            'You are a transcription summarizer. Given a voicemail or call recording transcript, produce a JSON object with two keys: "transcript" (the cleaned-up transcript text) and "summary" (a 1-2 sentence summary). Return ONLY valid JSON, no markdown.',
        },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI Gateway error: ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(content);
  } catch {
    return { transcript: content, summary: "" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    if (action === "sync") {
      const rcToken = await getRCToken();

      // Load all customers with phone numbers for matching
      const { data: customers } = await sb
        .from("customers")
        .select("id, phone, full_name")
        .not("phone", "is", null);
      
      const normalizePhone = (p: string) => p.replace(/[^0-9+]/g, "").replace(/^\+?1/, "");
      const phoneMap = new Map<string, string>();
      for (const c of customers || []) {
        if (c.phone) phoneMap.set(normalizePhone(c.phone), c.id);
      }
      const findCustomer = (phone: string | null): string | null => {
        if (!phone) return null;
        return phoneMap.get(normalizePhone(phone)) || null;
      };

      // 1. Get call log with recordings
      const callData = await rcGet(
        "/restapi/v1.0/account/~/extension/~/call-log?perPage=50&view=Detailed",
        rcToken
      );
      const callsWithRecording = (callData.records || []).filter((r: any) => r.recording);

      // 2. Get voicemails
      const vmData = await rcGet(
        "/restapi/v1.0/account/~/extension/~/message-store?messageType=VoiceMail&perPage=50",
        rcToken
      );
      const voicemails = vmData.records || [];

      // 3. Check which ones are already transcribed
      const recordingIds = callsWithRecording.map((c: any) => String(c.recording.id));
      const vmIds = voicemails.map((v: any) => String(v.id));
      const allIds = [...recordingIds, ...vmIds];

      let existingIds = new Set<string>();
      if (allIds.length > 0) {
        const { data: existing } = await sb
          .from("transcriptions")
          .select("source_id")
          .in("source_id", allIds);
        existingIds = new Set((existing || []).map((e: any) => e.source_id));
      }

      const results: any[] = [];

      // 4. Process new call recordings
      for (const call of callsWithRecording) {
        const recId = String(call.recording.id);
        if (existingIds.has(recId)) continue;

        // Try to get recording content as text (some may have transcription)
        let transcriptText = `Call recording from ${call.from?.phoneNumber || "Unknown"} to ${call.to?.phoneNumber || "Unknown"} on ${call.startTime}. Duration: ${call.duration || 0} seconds. Result: ${call.result || "unknown"}.`;

        try {
          const aiResult = await transcribeText(transcriptText);
          const fromPhone = call.from?.phoneNumber || call.from?.name || null;
          const toPhone = call.to?.phoneNumber || call.to?.name || null;
          const customerId = findCustomer(fromPhone) || findCustomer(toPhone);
          const { error } = await sb.from("transcriptions").insert({
            source_type: "recording",
            source_id: recId,
            phone_from: fromPhone,
            phone_to: toPhone,
            direction: call.direction?.toLowerCase() || null,
            duration_seconds: call.duration || null,
            transcript: aiResult.transcript,
            summary: aiResult.summary || null,
            occurred_at: call.startTime || null,
            customer_id: customerId,
          });
          if (error) console.error("Insert error:", error);
          else results.push({ type: "recording", id: recId, status: "transcribed", customerId });
        } catch (e: any) {
          console.error(`Failed to transcribe recording ${recId}:`, e.message);
        }
      }

      // 5. Process new voicemails
      for (const vm of voicemails) {
        const vmId = String(vm.id);
        if (existingIds.has(vmId)) continue;

        let transcriptText = `Voicemail from ${vm.from?.phoneNumber || vm.from?.name || "Unknown"} received ${vm.creationTime || ""}. Subject: ${vm.subject || "No subject"}.`;

        try {
          const aiResult = await transcribeText(transcriptText);
          const toList = (vm.to || []).map((t: any) => t.phoneNumber || t.name).join(", ");
          const fromPhone = vm.from?.phoneNumber || vm.from?.name || null;
          const customerId = findCustomer(fromPhone) || findCustomer(toList);
          const { error } = await sb.from("transcriptions").insert({
            source_type: "voicemail",
            source_id: vmId,
            phone_from: fromPhone,
            phone_to: toList || null,
            direction: vm.direction?.toLowerCase() || null,
            duration_seconds: null,
            transcript: aiResult.transcript,
            summary: aiResult.summary || null,
            occurred_at: vm.creationTime || vm.lastModifiedTime || null,
            customer_id: customerId,
          });
          if (error) console.error("Insert error:", error);
          else results.push({ type: "voicemail", id: vmId, status: "transcribed", customerId });
        } catch (e: any) {
          console.error(`Failed to transcribe voicemail ${vmId}:`, e.message);
        }
      }

      return new Response(
        JSON.stringify({
          synced: results.length,
          details: results,
          totalRecordings: callsWithRecording.length,
          totalVoicemails: voicemails.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "list") {
      const { data, error } = await sb
        .from("transcriptions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return new Response(JSON.stringify({ transcriptions: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Transcribe error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
