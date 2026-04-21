import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Public endpoint that returns the Vapi call transcript as a downloadable .txt file.
 *
 * Usage:
 *   GET /functions/v1/call-transcript?call_id=<vapi_call_id>
 *   GET /functions/v1/call-transcript?call_id=<vapi_call_id>&format=json
 *   GET /functions/v1/call-transcript?call_id=<vapi_call_id>&include=recording  (302 redirect to recording)
 *
 * Looks up the customer record by `meta->>'vapi_call_id'` or by checking
 * `meta->'vapi_call_sessions'` history.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get("call_id") || url.searchParams.get("c") || "";
    const format = (url.searchParams.get("format") || "txt").toLowerCase();
    const include = (url.searchParams.get("include") || "").toLowerCase();

    if (!callId) {
      return new Response("Missing call_id", { status: 400, headers: corsHeaders });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Try direct match on top-level meta
    let { data: customer } = await sb
      .from("customers")
      .select("id, full_name, phone, email, meta, notes")
      .filter("meta->>vapi_call_id", "eq", callId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let session: any = null;

    // 2) Fallback: scan vapi_call_sessions arrays for any customer that contains this call
    if (!customer) {
      const { data: candidates } = await sb
        .from("customers")
        .select("id, full_name, phone, email, meta, notes")
        .not("meta->vapi_call_sessions", "is", null)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (candidates?.length) {
        for (const c of candidates) {
          const sessions = ((c.meta as any)?.vapi_call_sessions || []) as any[];
          const found = sessions.find((s) => s?.call_id === callId);
          if (found) {
            customer = c;
            session = found;
            break;
          }
        }
      }
    }

    if (!customer) {
      return new Response(`No record found for call ${callId}`, { status: 404, headers: corsHeaders });
    }

    const meta = (customer.meta as any) || {};
    const transcript: string = session?.transcript || meta.vapi_transcript || "";
    const summary: string = session?.summary || meta.vapi_summary || "";
    const aiNotes: string = session?.ai_notes || meta.vapi_ai_notes || "";
    const recordingUrl: string | null = session?.recording_url || meta.vapi_recording_url || null;
    const endedReason: string = session?.ended_reason || meta.vapi_ended_reason || "";
    const duration: number = session?.duration_seconds || meta.vapi_duration_seconds || 0;
    const disposition: string = session?.disposition || meta.vapi_disposition || "unknown";
    const date: string = session?.date || meta.vapi_last_contact || "";

    // Redirect mode: send user straight to the audio file
    if (include === "recording") {
      if (!recordingUrl) {
        return new Response("No recording available for this call", { status: 404, headers: corsHeaders });
      }
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: recordingUrl } });
    }

    if (format === "json") {
      return new Response(
        JSON.stringify({
          call_id: callId,
          customer: { id: customer.id, name: customer.full_name, phone: customer.phone, email: customer.email },
          date,
          duration_seconds: duration,
          ended_reason: endedReason,
          disposition,
          recording_url: recordingUrl,
          summary,
          transcript,
          ai_notes: aiNotes,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Plain-text downloadable transcript
    const lines: string[] = [];
    lines.push("════════════════════════════════════════════");
    lines.push("  VAPI AI CALL TRANSCRIPT");
    lines.push("════════════════════════════════════════════");
    lines.push("");
    lines.push(`Customer:        ${customer.full_name || "Unknown"}`);
    if (customer.phone) lines.push(`Phone:           ${customer.phone}`);
    if (customer.email) lines.push(`Email:           ${customer.email}`);
    lines.push(`Call ID:         ${callId}`);
    if (date) lines.push(`Date:            ${date}`);
    if (duration) lines.push(`Duration:        ${Math.round(duration)}s`);
    if (endedReason) lines.push(`Ended Reason:    ${endedReason}`);
    lines.push(`Disposition:     ${disposition}`);
    if (recordingUrl) lines.push(`Recording:       ${recordingUrl}`);
    lines.push("");
    lines.push("────────────────────────────────────────────");
    lines.push("  SUMMARY");
    lines.push("────────────────────────────────────────────");
    lines.push(summary || "(no summary)");
    lines.push("");
    lines.push("────────────────────────────────────────────");
    lines.push("  AI NOTES");
    lines.push("────────────────────────────────────────────");
    lines.push(aiNotes || "(no notes)");
    lines.push("");
    lines.push("────────────────────────────────────────────");
    lines.push("  FULL TRANSCRIPT");
    lines.push("────────────────────────────────────────────");
    lines.push(transcript || "(no transcript captured)");
    lines.push("");

    const body = lines.join("\n");
    const safeName = (customer.full_name || "caller").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
    const filename = `transcript_${safeName}_${callId.slice(0, 8)}.txt`;

    return new Response(body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("[call-transcript] error:", err?.message || err);
    return new Response(`Error: ${err?.message || "Unknown"}`, { status: 500, headers: corsHeaders });
  }
});
