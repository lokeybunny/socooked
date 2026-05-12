// Sync replies from a Google Sheet, classify each row with AI, store in Supabase.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HOT = ["HOT_POSITIVE", "WARM_INTERESTED", "PRICING_QUESTION", "CALLBACK_REQUEST", "NEEDS_REVIEW"];

function extractSheetId(url: string): string | null {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// Parse CSV (simple, handles quoted fields)
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuote = false;
      else cur += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',') { row.push(cur); cur = ""; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

async function fetchSheetCSV(sheetId: string, sheetName?: string): Promise<string> {
  // Public/published sheet - using gviz endpoint which works for "anyone with link" sheets
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv${sheetName ? `&sheet=${encodeURIComponent(sheetName)}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet fetch failed (${res.status}). Make sure the sheet is shared as "Anyone with the link can view".`);
  return await res.text();
}

function pickColumn(headers: string[], names: string[]): number {
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const n of names) {
    const idx = lower.findIndex(h => h === n.toLowerCase() || h.includes(n.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

function normalizePhone(p: string): string {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return d ? `+${d}` : "";
}

async function classifyReply(reply: string): Promise<{ classification: string; confidence: number; reason: string; is_hot: boolean; is_opt_out: boolean }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

  const sys = `You classify SMS replies from cold-outreach campaigns. Categories:
- HOT_POSITIVE: clearly interested, ready to talk
- WARM_INTERESTED: showing curiosity or openness
- PRICING_QUESTION: asking about cost/rates
- CALLBACK_REQUEST: asking to be called back
- NEGATIVE: rude, not interested, "already have someone", retired
- OPT_OUT: stop, unsubscribe, remove me, do not contact, legal threat
- WRONG_NUMBER: wrong person/number
- AUTO_REPLY: out of office, automated, busy auto-reply
- NEEDS_REVIEW: ambiguous

Curiosity questions ("who is this?", "what?", "send info", "maybe", "examples?", "how does it work?") => WARM_INTERESTED or HOT_POSITIVE.
STOP/REMOVE/UNSUBSCRIBE => OPT_OUT.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Reply: "${reply}"` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "classify",
          parameters: {
            type: "object",
            properties: {
              classification: { type: "string", enum: ["HOT_POSITIVE","WARM_INTERESTED","PRICING_QUESTION","CALLBACK_REQUEST","NEGATIVE","OPT_OUT","WRONG_NUMBER","AUTO_REPLY","NEEDS_REVIEW"] },
              confidence: { type: "number" },
              reason: { type: "string", description: "1 sentence explanation" },
            },
            required: ["classification","confidence","reason"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "classify" } },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error("AI err", res.status, t);
    // Fallback heuristic
    const lower = reply.toLowerCase();
    if (/\b(stop|unsubscribe|remove me|do not contact)\b/.test(lower)) {
      return { classification: "OPT_OUT", confidence: 0.95, reason: "Contains opt-out keyword", is_hot: false, is_opt_out: true };
    }
    return { classification: "NEEDS_REVIEW", confidence: 0.3, reason: "AI unavailable; manual review needed", is_hot: true, is_opt_out: false };
  }

  const data = await res.json();
  const args = JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}");
  const classification = args.classification || "NEEDS_REVIEW";
  return {
    classification,
    confidence: Number(args.confidence) || 0.5,
    reason: args.reason || "",
    is_hot: HOT.includes(classification),
    is_opt_out: classification === "OPT_OUT",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const sheetUrl: string | undefined = body.sheet_url;
    const sheetName: string | undefined = body.sheet_name;
    const limit: number = Math.min(Number(body.limit) || 200, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Use stored settings if no URL passed
    let url = sheetUrl;
    let sheet = sheetName;
    if (!url) {
      const { data: s } = await supabase.from("hot_reply_sync_settings").select("*").limit(1).maybeSingle();
      url = s?.google_sheet_url;
      sheet = sheet || s?.sheet_name;
    }
    if (!url) throw new Error("No Google Sheet URL configured");

    const sheetId = extractSheetId(url);
    if (!sheetId) throw new Error("Invalid Google Sheet URL");

    const csv = await fetchSheetCSV(sheetId, sheet);
    const rows = parseCSV(csv);
    if (rows.length < 2) throw new Error("Sheet is empty");

    const headers = rows[0];
    const idx = {
      date: pickColumn(headers, ["date"]),
      time: pickColumn(headers, ["time"]),
      first: pickColumn(headers, ["first name", "first"]),
      last: pickColumn(headers, ["last name", "last"]),
      phone: pickColumn(headers, ["phone number", "phone"]),
      reply: pickColumn(headers, ["reply text", "reply", "message"]),
      campaign: pickColumn(headers, ["campaign name", "campaign"]),
      source: pickColumn(headers, ["source"]),
      status: pickColumn(headers, ["status"]),
    };
    if (idx.phone < 0 || idx.reply < 0) {
      throw new Error("Sheet must have Phone Number and Reply Text columns");
    }

    const dataRows = rows.slice(1, 1 + limit);
    let imported = 0, skipped = 0, classified = 0;

    for (const r of dataRows) {
      const phone = normalizePhone(r[idx.phone] || "");
      const reply = (r[idx.reply] || "").trim();
      if (!phone || !reply) { skipped++; continue; }

      const date = idx.date >= 0 ? r[idx.date] : "";
      const time = idx.time >= 0 ? r[idx.time] : "";
      const dedupe = `${phone}|${reply.slice(0, 120)}|${date}|${time}`.toLowerCase();

      const { data: existing } = await supabase.from("hot_reply_imports")
        .select("id").eq("dedupe_key", dedupe).maybeSingle();
      if (existing) { skipped++; continue; }

      // Classify
      let cls;
      try {
        cls = await classifyReply(reply);
        classified++;
      } catch (e) {
        console.error("classify err", e);
        cls = { classification: "NEEDS_REVIEW", confidence: 0, reason: "Pending classification", is_hot: true, is_opt_out: false };
      }

      const { error: insErr } = await supabase.from("hot_reply_imports").insert({
        dedupe_key: dedupe,
        first_name: idx.first >= 0 ? r[idx.first] : null,
        last_name: idx.last >= 0 ? r[idx.last] : null,
        phone,
        reply_text: reply,
        campaign_name: idx.campaign >= 0 ? r[idx.campaign] : null,
        source: idx.source >= 0 ? r[idx.source] : null,
        original_date: date || null,
        original_time: time || null,
        ai_classification: cls.classification,
        ai_confidence: cls.confidence,
        ai_reason: cls.reason,
        is_hot: cls.is_hot,
        is_opt_out: cls.is_opt_out,
      });
      if (insErr) { console.error("insert err", insErr); skipped++; }
      else imported++;
    }

    // Update settings
    await supabase.from("hot_reply_sync_settings").upsert({
      id: (await supabase.from("hot_reply_sync_settings").select("id").limit(1).maybeSingle()).data?.id,
      google_sheet_url: url,
      sheet_name: sheet || "Sheet1",
      last_sync_at: new Date().toISOString(),
    }, { onConflict: "id" });

    return new Response(JSON.stringify({ imported, skipped, classified, total: dataRows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("hot-replies-sync error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
