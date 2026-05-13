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
    const limit: number = Math.min(Number(body.limit) || 5000, 10000);

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
      date: pickColumn(headers, ["date", "sent date", "timestamp"]),
      time: pickColumn(headers, ["time", "sent time"]),
      first: pickColumn(headers, ["first name", "first", "fname"]),
      last: pickColumn(headers, ["last name", "last", "lname"]),
      phone: pickColumn(headers, ["phone number", "phone", "mobile", "cell", "number", "to", "from"]),
      reply: pickColumn(headers, ["reply text", "reply", "message", "response", "body", "text", "sms"]),
      campaign: pickColumn(headers, ["campaign name", "campaign", "list"]),
      source: pickColumn(headers, ["source"]),
      status: pickColumn(headers, ["status"]),
    };
    if (idx.phone < 0 || idx.reply < 0) {
      throw new Error(`Sheet must have a phone column (Phone/Phone Number/Mobile) and a reply column (Reply/Reply Text/Message/Response). Detected headers: [${headers.join(" | ")}]`);
    }

    const dataRows = rows.slice(1, 1 + limit);

    // Pre-build candidate rows + dedupe keys
    const rawCandidates = dataRows.map(r => {
      const phone = normalizePhone(r[idx.phone] || "");
      const reply = (r[idx.reply] || "").trim();
      const date = idx.date >= 0 ? r[idx.date] : "";
      const time = idx.time >= 0 ? r[idx.time] : "";
      const dedupe = `${phone}|${reply.slice(0, 120)}|${date}|${time}`.toLowerCase();
      return { r, phone, reply, date, time, dedupe };
    }).filter(c => c.phone && c.reply);

    // Dedupe within the sheet itself (same key appearing twice would kill a whole batch insert)
    const seenInSheet = new Set<string>();
    const candidates = rawCandidates.filter(c => {
      if (seenInSheet.has(c.dedupe)) return false;
      seenInSheet.add(c.dedupe);
      return true;
    });

    // Bulk-fetch existing dedupe keys in chunks (PostgREST .in() chokes on huge arrays)
    const existingSet = new Set<string>();
    const allKeys = candidates.map(c => c.dedupe);
    for (let i = 0; i < allKeys.length; i += 500) {
      const chunk = allKeys.slice(i, i + 500);
      const { data: existingRows } = await supabase
        .from("hot_reply_imports")
        .select("dedupe_key")
        .in("dedupe_key", chunk);
      for (const x of existingRows || []) existingSet.add((x as any).dedupe_key);
    }
    const fresh = candidates.filter(c => !existingSet.has(c.dedupe));
    const skipped = candidates.length - fresh.length + (dataRows.length - candidates.length);

    // Background task: classify in parallel batches and insert
    const processInBackground = async () => {
      const CONCURRENCY = 8;
      let imported = 0, classified = 0;
      for (let i = 0; i < fresh.length; i += CONCURRENCY) {
        const batch = fresh.slice(i, i + CONCURRENCY);
        const classified_results = await Promise.all(batch.map(async (c) => {
          try {
            const cls = await classifyReply(c.reply);
            classified++;
            return cls;
          } catch (e) {
            console.error("classify err", e);
            return { classification: "NEEDS_REVIEW", confidence: 0, reason: "Pending classification", is_hot: true, is_opt_out: false };
          }
        }));
        const inserts = batch.map((c, j) => {
          const cls = classified_results[j];
          return {
            dedupe_key: c.dedupe,
            first_name: idx.first >= 0 ? c.r[idx.first] : null,
            last_name: idx.last >= 0 ? c.r[idx.last] : null,
            phone: c.phone,
            reply_text: c.reply,
            campaign_name: idx.campaign >= 0 ? c.r[idx.campaign] : null,
            source: idx.source >= 0 ? c.r[idx.source] : null,
            original_date: c.date || null,
            original_time: c.time || null,
            ai_classification: cls.classification,
            ai_confidence: cls.confidence,
            ai_reason: cls.reason,
            is_hot: cls.is_hot,
            is_opt_out: cls.is_opt_out,
          };
        });
        const { error } = await supabase.from("hot_reply_imports").insert(inserts);
        if (error) console.error("bulk insert err", error);
        else imported += inserts.length;
      }
      console.log(`[hot-replies-sync] bg done: imported=${imported}, classified=${classified}`);

      // Update settings after background work
      const { data: settingsRow } = await supabase.from("hot_reply_sync_settings").select("id").limit(1).maybeSingle();
      await supabase.from("hot_reply_sync_settings").upsert({
        id: settingsRow?.id,
        google_sheet_url: url,
        sheet_name: sheet || "Sheet1",
        last_sync_at: new Date().toISOString(),
      }, { onConflict: "id" });
    };

    // @ts-ignore EdgeRuntime is provided in Supabase functions runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processInBackground());
    } else {
      processInBackground().catch(e => console.error("bg err", e));
    }

    return new Response(JSON.stringify({
      queued: fresh.length,
      skipped,
      total: dataRows.length,
      message: "Sync started in background. New rows will appear shortly.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("hot-replies-sync error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
