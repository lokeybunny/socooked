import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();

    // Support both Apify webhook and direct POST
    const runId = body.run_id || body.resource?.id;
    const datasetId = body.dataset_id || body.resource?.defaultDatasetId;
    const sourceId = body.source_id;
    const platform = body.platform || "unknown";
    const directRecords = body.records; // for direct POST ingestion

    let records: any[] = [];

    if (directRecords && Array.isArray(directRecords)) {
      records = directRecords;
    } else if (datasetId) {
      // Fetch from Apify dataset
      const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
      const dsRes = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=500`
      );
      if (dsRes.ok) records = await dsRes.json();
    }

    if (!records.length) {
      return new Response(JSON.stringify({ message: "No records to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load config
    const { data: configRows } = await supabase.from("lw_buyer_config").select("key, value");
    const config: Record<string, any> = {};
    (configRows || []).forEach((r: any) => { config[r.key] = r.value; });
    const keywords = config.intent_keywords || { high: [], medium: [], low: [] };
    const thresholds = config.scoring_thresholds || { high_intent: 70, medium_intent: 40, auto_qualify: 85 };
    const autoCreateTasks = config.auto_create_tasks === true || config.auto_create_tasks === "true";
    const alertConfig = config.telegram_alerts || { enabled: true, min_score: 70 };

    // Normalize records, filter out placeholder/error records
    const normalized = records
      .filter((r: any) => {
        // Skip Apify placeholder "No posts found" entries
        if (r.title && r.title.startsWith("No posts found")) return false;
        if (!r.url && !r.postUrl && !r.link && !r.email && !r.phone && !r.name && !r.full_name) return false;
        return true;
      })
      .map((r: any) => normalizeRecord(r, platform));

    // Load existing buyers for dedup
    const emails = normalized.map((n: any) => n.email).filter(Boolean);
    const phones = normalized.map((n: any) => n.phone).filter(Boolean);
    const sourceUrls = normalized.map((n: any) => n.source_url).filter(Boolean);

    const { data: existingBuyers } = await supabase
      .from("lw_buyers")
      .select("id, email, phone, source_url, full_name, entity_name")
      .or(
        [
          emails.length ? `email.in.(${emails.map((e: string) => `"${e}"`).join(",")})` : null,
          phones.length ? `phone.in.(${phones.map((p: string) => `"${p}"`).join(",")})` : null,
          sourceUrls.length ? `source_url.in.(${sourceUrls.map((u: string) => `"${u}"`).join(",")})` : null,
        ].filter(Boolean).join(",")
      );

    const existingMap = new Map<string, any>();
    (existingBuyers || []).forEach((b: any) => {
      if (b.email) existingMap.set(`email:${b.email.toLowerCase()}`, b);
      if (b.phone) existingMap.set(`phone:${b.phone}`, b);
      if (b.source_url) existingMap.set(`url:${b.source_url}`, b);
      existingMap.set(`name:${(b.full_name || "").toLowerCase()}`, b);
    });

    let newCount = 0, updatedCount = 0, skippedCount = 0, highScoreCount = 0;
    const highScoreBuyers: any[] = [];

    // Prepare batch arrays
    const newBuyerRows: any[] = [];
    const updateOps: { id: string; updates: any }[] = [];

    for (const record of normalized) {
      try {
        const scored = scoreRecord(record, keywords, thresholds);
        const existing = findExisting(record, existingMap);

        if (existing) {
          const updates: any = {
            last_seen_signal: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          if (scored.buyer_score > 0) updates.buyer_score = scored.buyer_score;
          if (scored.intent_level !== "low") updates.intent_level = scored.intent_level;
          if (scored.buyer_type !== "unknown") updates.buyer_type = scored.buyer_type;
          if (scored.intent_summary) updates.intent_summary = scored.intent_summary;
          updateOps.push({ id: existing.id, updates });
          updatedCount++;
        } else {
          newBuyerRows.push({
            full_name: record.full_name || "Unknown Buyer",
            email: record.email,
            phone: record.phone,
            entity_name: record.company,
            city: record.city,
            source: "apify",
            source_platform: platform,
            source_url: record.source_url,
            deal_type: record.deal_type || "land",
            target_states: record.states || [],
            target_counties: record.counties || [],
            budget_min: record.budget_min,
            budget_max: record.budget_max,
            acreage_min: record.acreage_min,
            acreage_max: record.acreage_max,
            buyer_score: scored.buyer_score,
            confidence_score: scored.confidence_score,
            buyer_type: scored.buyer_type,
            intent_level: scored.intent_level,
            intent_summary: scored.intent_summary,
            raw_source_data: record.raw,
            pipeline_stage: scored.buyer_score >= thresholds.auto_qualify ? "qualified" : "new_scraped",
            status: "active",
            last_seen_signal: new Date().toISOString(),
            tags: scored.tags,
            notes: `Discovered via ${platform}. ${scored.intent_summary || ""}`,
          });
          newCount++;
        }

        if (scored.buyer_score >= thresholds.high_intent) {
          highScoreCount++;
          highScoreBuyers.push({ name: record.full_name, score: scored.buyer_score, type: scored.buyer_type, platform });
        }
      } catch (err) {
        console.error("Record processing error:", err);
        skippedCount++;
      }
    }

    // Batch insert new buyers
    if (newBuyerRows.length > 0) {
      const { data: inserted, error: insertErr } = await supabase
        .from("lw_buyers")
        .insert(newBuyerRows)
        .select("id, full_name, buyer_score, buyer_type");
      if (insertErr) {
        console.error("Batch insert error:", insertErr);
        // Fallback: try one-by-one for dedup conflicts
        for (const row of newBuyerRows) {
          const { error: singleErr } = await supabase.from("lw_buyers").insert(row);
          if (singleErr) { skippedCount++; newCount--; }
        }
      } else if (inserted) {
        // Batch insert activity logs
        const activityRows = inserted.map((b: any) => ({
          entity_type: "lw_buyer",
          entity_id: b.id,
          action: "discovery_created",
          meta: { name: b.full_name, platform, score: b.buyer_score, type: b.buyer_type },
        }));
        await supabase.from("activity_log").insert(activityRows);
      }
    }

    // Batch updates (parallel, max 10 concurrent)
    const UPDATE_BATCH = 10;
    for (let i = 0; i < updateOps.length; i += UPDATE_BATCH) {
      const batch = updateOps.slice(i, i + UPDATE_BATCH);
      await Promise.all(batch.map(op =>
        supabase.from("lw_buyers").update(op.updates).eq("id", op.id)
      ));
    }

    // Update ingestion log
    const skipLogUpdate = body.skip_log_update === true;
    if (!skipLogUpdate && (runId || sourceId)) {
      const logUpdate: any = {
        status: "completed",
        records_received: records.length,
        records_new: newCount,
        records_updated: updatedCount,
        records_skipped: skippedCount,
        high_score_count: highScoreCount,
      };

      if (runId) {
        await supabase
          .from("lw_buyer_ingestion_logs")
          .update(logUpdate)
          .eq("apify_run_id", runId);
      } else {
        await supabase.from("lw_buyer_ingestion_logs").insert({
          ...logUpdate,
          source_id: sourceId,
          platform,
        });
      }
    }

    // Send Telegram alerts for high-score buyers
    if (alertConfig.enabled && highScoreBuyers.length > 0) {
      await sendTelegramAlert(highScoreBuyers, newCount, updatedCount, platform);
    }

    const result = {
      records_received: records.length,
      new: newCount,
      updated: updatedCount,
      skipped: skippedCount,
      high_score: highScoreCount,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("buyer-ingest error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Normalize raw scraped record ──
function normalizeRecord(raw: any, platform: string) {
  // For craigslist, the record has: title, url, category, datetime, id
  // We need to use title as the primary text and derive a name from it
  const rawTitle = raw.title || "";
  const rawBody = raw.text || raw.body || raw.description || raw.content || "";
  const fullText = (rawTitle + " " + rawBody).toLowerCase();

  // For CL posts, use the post title as the buyer "name" since there's no author info
  const name =
    raw.full_name || raw.name || raw.author || raw.username || raw.displayName || raw.authorName || "";

  const email = extractEmail(fullText + " " + (raw.email || ""));
  const phone = extractPhone(fullText + " " + (raw.phone || ""));

  // Extract location from URL subdomain (e.g. "mendocino.craigslist.org")
  const urlStr = raw.url || raw.postUrl || raw.link || "";
  let city = raw.city || raw.location || null;
  if (!city && urlStr) {
    const urlMatch = urlStr.match(/https?:\/\/(\w+)\.craigslist\.org/);
    if (urlMatch) city = urlMatch[1];
  }

  // Extract location signals
  const states = extractStates(fullText);
  const counties = extractCounties(fullText);

  // Extract budget signals
  const budgetMatch = fullText.match(/\$\s*([\d,]+)\s*[-–to]+\s*\$?\s*([\d,]+)/);
  const singleBudget = fullText.match(/budget[:\s]*\$?\s*([\d,]+)/i);

  return {
    full_name: name.trim() || rawTitle.trim().slice(0, 100) || null,
    email,
    phone,
    company: raw.company || raw.organization || null,
    city: city || null,
    source_url: urlStr || null,
    deal_type: detectDealType(fullText),
    states,
    counties,
    budget_min: budgetMatch ? parseInt(budgetMatch[1].replace(/,/g, "")) : singleBudget ? parseInt(singleBudget[1].replace(/,/g, "")) * 0.7 : null,
    budget_max: budgetMatch ? parseInt(budgetMatch[2].replace(/,/g, "")) : singleBudget ? parseInt(singleBudget[1].replace(/,/g, "")) : null,
    acreage_min: extractAcreage(fullText, "min"),
    acreage_max: extractAcreage(fullText, "max"),
    text: fullText,
    raw,
  };
}

// ── Score record based on keywords ──
function scoreRecord(record: any, keywords: any, thresholds: any) {
  const text = record.text || "";
  let score = 0;
  let confidence = 0;
  const matchedKeywords: string[] = [];

  // High-intent keywords (+15 each, max contribution 60)
  for (const kw of keywords.high || []) {
    if (text.includes(kw.toLowerCase())) {
      score += 15;
      confidence += 10;
      matchedKeywords.push(kw);
    }
  }
  // Medium-intent keywords (+8 each)
  for (const kw of keywords.medium || []) {
    if (text.includes(kw.toLowerCase())) {
      score += 8;
      confidence += 5;
      matchedKeywords.push(kw);
    }
  }
  // Low-intent keywords (+3 each)
  for (const kw of keywords.low || []) {
    if (text.includes(kw.toLowerCase())) {
      score += 3;
      confidence += 2;
    }
  }

  // Bonus signals
  if (record.email) { score += 5; confidence += 5; }
  if (record.phone) { score += 10; confidence += 10; }
  if (record.budget_max) { score += 8; confidence += 5; }
  if (record.states.length > 0) { score += 5; confidence += 5; }
  if (record.counties.length > 0) { score += 5; confidence += 5; }
  if (text.includes("land")) score += 5;
  if (text.includes("vacant")) score += 5;
  if (text.includes("acreage") || text.includes("acres")) score += 5;

  score = Math.min(score, 100);
  confidence = Math.min(confidence, 100);

  // Determine buyer type
  let buyerType = "unknown";
  if (text.includes("cash buyer") || text.includes("cash ready")) buyerType = "cash_buyer";
  else if (text.includes("developer") || text.includes("development")) buyerType = "developer";
  else if (text.includes("wholesale") || text.includes("wholesal")) buyerType = "wholesaler_buyer";
  else if (text.includes("land") && (text.includes("buy") || text.includes("investor"))) buyerType = "land_buyer";
  else if (text.includes("invest")) buyerType = "investor";

  // Intent level
  let intentLevel = "low";
  if (score >= thresholds.high_intent) intentLevel = "high";
  else if (score >= thresholds.medium_intent) intentLevel = "medium";

  // Tags
  const tags: string[] = [];
  if (buyerType !== "unknown") tags.push(buyerType.replace(/_/g, "-"));
  if (record.states.length) tags.push(...record.states.map((s: string) => `state:${s}`));
  if (intentLevel === "high") tags.push("high-intent");
  if (record.deal_type === "land") tags.push("land");

  return {
    buyer_score: score,
    confidence_score: confidence,
    buyer_type: buyerType,
    intent_level: intentLevel,
    intent_summary: matchedKeywords.length
      ? `Matched keywords: ${matchedKeywords.join(", ")}. ${buyerType !== "unknown" ? `Classified as ${buyerType}.` : ""}`
      : "No strong intent keywords matched.",
    tags,
  };
}

// ── Dedup matching ──
function findExisting(record: any, existingMap: Map<string, any>) {
  if (record.email && existingMap.has(`email:${record.email.toLowerCase()}`))
    return existingMap.get(`email:${record.email.toLowerCase()}`);
  if (record.phone && existingMap.has(`phone:${record.phone}`))
    return existingMap.get(`phone:${record.phone}`);
  if (record.source_url && existingMap.has(`url:${record.source_url}`))
    return existingMap.get(`url:${record.source_url}`);
  // Skip name-based dedup — post titles aren't buyer names and cause false positives
  return null;
}

// ── Helpers ──
function extractEmail(text: string): string | null {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

function extractPhone(text: string): string | null {
  const m = text.match(/(\+?1?\s*[-.(]?\s*\d{3}\s*[-.)]\s*\d{3}\s*[-.]?\s*\d{4})/);
  if (!m) return null;
  const digits = m[1].replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : null;
}

const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

function extractStates(text: string): string[] {
  const found = new Set<string>();
  for (const [name, abbr] of Object.entries(US_STATES)) {
    if (text.includes(name)) found.add(abbr);
  }
  const abbrMatch = text.match(/\b([A-Z]{2})\b/g);
  if (abbrMatch) {
    const validAbbrs = new Set(Object.values(US_STATES));
    abbrMatch.forEach((a) => { if (validAbbrs.has(a)) found.add(a); });
  }
  return Array.from(found);
}

function extractCounties(text: string): string[] {
  const matches = text.match(/(\w+)\s+county/gi);
  return matches ? [...new Set(matches.map((m) => m.replace(/\s+county/i, "").trim()))] : [];
}

function extractCity(text: string): string | null {
  return null; // Would need a city database; skip for now
}

function extractAcreage(text: string, type: "min" | "max"): number | null {
  const rangeMatch = text.match(/([\d.]+)\s*[-–to]+\s*([\d.]+)\s*(?:acres?|ac)/i);
  if (rangeMatch) return type === "min" ? parseFloat(rangeMatch[1]) : parseFloat(rangeMatch[2]);
  const singleMatch = text.match(/([\d.]+)\s*(?:\+\s*)?(?:acres?|ac)/i);
  if (singleMatch) return type === "min" ? parseFloat(singleMatch[1]) : null;
  return null;
}

function detectDealType(text: string): string {
  if (text.includes("land") || text.includes("vacant") || text.includes("acreage") || text.includes("rural"))
    return "land";
  if (text.includes("home") || text.includes("house") || text.includes("residential")) return "home";
  return "land"; // default to land per user priority
}

// ── Telegram Alert ──
async function sendTelegramAlert(buyers: any[], newCount: number, updatedCount: number, platform: string) {
  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!BOT_TOKEN || !CHAT_ID) return;

  const topBuyers = buyers.slice(0, 5);
  const lines = [
    "🔍 <b>BUYER DISCOVERY ALERT</b>",
    "",
    `📡 Source: <b>${platform}</b>`,
    `✅ New: ${newCount} | 🔄 Updated: ${updatedCount}`,
    `🔥 High-Score: ${buyers.length}`,
    "",
    ...topBuyers.map(
      (b, i) => `${i + 1}. <b>${b.name || "Unknown"}</b> — Score: ${b.score} (${b.type})`
    ),
  ];

  if (buyers.length > 5) lines.push(`... and ${buyers.length - 5} more`);

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: lines.join("\n"),
      parse_mode: "HTML",
    }),
  });
}
