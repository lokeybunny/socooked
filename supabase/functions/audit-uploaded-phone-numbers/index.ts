// Phone-quality-gated upload: parses CSV, runs Twilio Lookup on unique numbers,
// returns audit summary in Phase A; in Phase B saves only mobile numbers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { lookupBatch } from "../_shared/twilio-lookup.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COST_PER_LOOKUP = 0.008;

function parseCsvFast(text: string): Record<string, string>[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let cur: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { cur.push(field); field = ""; }
      else if (ch === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (ch === "\r") { /* skip */ }
      else field += ch;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = new Array(rows.length - 1);
  for (let r = 1; r < rows.length; r++) {
    const obj: Record<string, string> = {};
    const row = rows[r];
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = row[c] ?? "";
    out[r - 1] = obj;
  }
  return out;
}

function toE164(raw: unknown): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

function findKey(row: Record<string, any>, candidates: string[]): string | undefined {
  const map = new Map(Object.keys(row).map((k) => [k.toLowerCase().trim(), k]));
  for (const c of candidates) { const hit = map.get(c.toLowerCase()); if (hit) return hit; }
  for (const c of candidates) {
    for (const [lk, orig] of map.entries()) if (lk.includes(c.toLowerCase())) return orig;
  }
  return undefined;
}

function cleanStr(v: unknown) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
function cleanEmail(v: unknown) {
  const s = cleanStr(v);
  if (!s) return null;
  const lower = s.toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower) ? lower : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const selectedState = String(form.get("selected_state") || "").trim();
    const progressId = String(form.get("progress_id") || "").trim();
    const confirmed = String(form.get("confirmed") || "false") === "true";
    const skipAudit = String(form.get("skip_audit") || "false") === "true";
    const importBatchId = String(form.get("import_batch_id") || crypto.randomUUID());

    if (!file || !selectedState) {
      return new Response(JSON.stringify({ error: "file and selected_state required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const broadcast = async (event: string, payload: Record<string, unknown>) => {
      if (!progressId) return;
      try {
        await fetch(`${SUPA_URL}/realtime/v1/api/broadcast`, {
          method: "POST",
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [{ topic: `audit:${progressId}`, event, payload, private: false }],
          }),
        });
      } catch (_) { /* ignore */ }
    };

    const isCsv = /\.csv$/i.test(file.name) || (file.type || "").includes("csv");
    const fileName = file.name;
    const fileText = isCsv ? await file.text() : "";
    const fileBuf = isCsv ? null : new Uint8Array(await file.arrayBuffer());

    const work = (async () => {
      try {
        await broadcast("status", { phase: "parsing", message: "Parsing file…" });

        let rows: Record<string, any>[];
        if (isCsv) rows = parseCsvFast(fileText);
        else {
          const wb = XLSX.read(fileBuf!, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
        }

        await broadcast("status", { phase: "parsed", total_rows: rows.length });

        if (!rows.length) {
          await broadcast("complete", { audit: emptyAudit(importBatchId, fileName, selectedState) });
          return;
        }

        const phoneKey = findKey(rows[0], ["phone_number", "phone", "mobile", "cell", "telephone"]);
        if (!phoneKey) {
          await broadcast("error", { message: "No phone column found" });
          return;
        }
        const nameKey = findKey(rows[0], ["full_name", "owner_name", "owner", "name"]);
        const firstNameKey = findKey(rows[0], ["first_name", "firstname", "given_name", "fname"]);
        const lastNameKey = findKey(rows[0], ["last_name", "lastname", "surname", "lname"]);
        const addrKey = findKey(rows[0], ["property_address", "address", "street", "street_address", "mailing_address"]);
        const cityKey = findKey(rows[0], ["city", "town"]);
        const zipKey = findKey(rows[0], ["zip", "zipcode", "postal", "postal_code"]);
        const emailKey = findKey(rows[0], ["email", "email_address", "e_mail", "owner_email", "contact_email", "mail"]);
        const officePhoneKey = findKey(rows[0], ["office_phone", "office phone", "office", "work_phone", "work phone", "landline"]);

        // Normalize + per-row tagging
        await broadcast("status", { phase: "normalizing", message: "Normalizing phone numbers…" });
        type Tagged = { row: Record<string, any>; raw: string; e164: string | null };
        const tagged: Tagged[] = rows.map((r) => {
          const raw = r[phoneKey] != null ? String(r[phoneKey]) : "";
          return { row: r, raw, e164: toE164(raw) };
        });

        const malformed = tagged.filter((t) => !t.e164).length;

        // Dedupe within file
        const seenInFile = new Set<string>();
        const uniqueE164: string[] = [];
        const dupesInFile: Tagged[] = [];
        const unique: Tagged[] = [];
        for (const t of tagged) {
          if (!t.e164) continue;
          if (seenInFile.has(t.e164)) { dupesInFile.push(t); continue; }
          seenInFile.add(t.e164);
          uniqueE164.push(t.e164);
          unique.push(t);
        }

        // Dedupe against existing state_leads
        await broadcast("status", { phase: "deduping", message: "Removing duplicates already in DB…" });
        const existingSet = new Set<string>();
        for (let i = 0; i < uniqueE164.length; i += 500) {
          const slice = uniqueE164.slice(i, i + 500);
          const { data } = await supabase
            .from("state_leads")
            .select("phone_e164")
            .in("phone_e164", slice);
          for (const r of data ?? []) existingSet.add(r.phone_e164);
        }
        const dupesInDb = unique.filter((t) => existingSet.has(t.e164!));
        const toLookup = unique.filter((t) => !existingSet.has(t.e164!));

        // Twilio Lookup
        await broadcast("status", {
          phase: "looking_up",
          message: `Twilio Lookup on ${toLookup.length} numbers…`,
          to_lookup: toLookup.length,
        });
        const lookupNumbers = toLookup.map((t) => t.e164!);
        const { results, cacheHits, newLookups } = await lookupBatch(supabase, lookupNumbers);

        await broadcast("status", {
          phase: "filtering",
          cache_hits: cacheHits,
          new_lookups: newLookups,
          message: "Classifying results…",
        });

        // Classify
        const approved: Tagged[] = [];
        const rejected: Array<{ t: Tagged; reason: string; result: any }> = [];
        let mobileCount = 0, landlineCount = 0, voipCount = 0,
          invalidCount = 0, unknownCount = 0, failedCount = 0;

        for (const t of toLookup) {
          const r = results[t.e164!];
          if (!r || r.status === "failed") {
            failedCount++;
            rejected.push({ t, reason: "lookup_failed", result: r ?? null });
            continue;
          }
          if (!r.valid) {
            invalidCount++;
            rejected.push({ t, reason: "invalid", result: r });
            continue;
          }
          const lt = r.line_type;
          if (lt === "mobile") { mobileCount++; approved.push(t); }
          else if (lt === "landline") { landlineCount++; rejected.push({ t, reason: "landline", result: r }); }
          else if (lt === "voip") { voipCount++; rejected.push({ t, reason: "voip", result: r }); }
          else if (lt === "unknown" || !lt) { unknownCount++; rejected.push({ t, reason: "unknown", result: r }); }
          else { rejected.push({ t, reason: lt, result: r }); }
        }

        const audit = {
          import_batch_id: importBatchId,
          file_name: fileName,
          state: selectedState,
          total_rows: rows.length,
          unique_numbers: uniqueE164.length,
          malformed_blank: malformed,
          duplicates_in_file: dupesInFile.length,
          duplicates_in_db: dupesInDb.length,
          mobile_approved: mobileCount,
          landlines_rejected: landlineCount,
          voip_rejected: voipCount,
          invalid_rejected: invalidCount,
          unknown_rejected: unknownCount,
          failed_lookups: failedCount,
          cache_hits: cacheHits,
          new_lookups: newLookups,
          estimated_cost_usd: Number((newLookups * COST_PER_LOOKUP).toFixed(4)),
          // Sample of rejected rows for download (lightweight)
          rejected_sample: rejected.slice(0, 50).map((r) => ({
            phone_raw: r.t.raw,
            phone_normalized: r.t.e164,
            rejection_reason: r.reason,
            line_type: r.result?.line_type ?? null,
            carrier: r.result?.carrier_name ?? null,
          })),
        };

        if (!confirmed) {
          // PHASE A: just return summary
          await broadcast("audit", { audit });
          await broadcast("complete", { audit, saved: false });
          return;
        }

        // PHASE B: write
        await broadcast("status", { phase: "saving", message: `Saving ${approved.length} mobile leads…` });

        // Build mobile inserts
        const mobileRows = approved.map((t) => buildLeadRow({
          t, selectedState, fileName, importBatchId,
          nameKey, firstNameKey, lastNameKey, addrKey, cityKey, zipKey, emailKey, officePhoneKey,
          result: results[t.e164!],
        }));

        let inserted = 0;
        for (let i = 0; i < mobileRows.length; i += 500) {
          const chunk = mobileRows.slice(i, i + 500);
          const { data, error } = await supabase
            .from("state_leads")
            .upsert(chunk, { onConflict: "phone_e164", ignoreDuplicates: true })
            .select("id");
          if (error) { await broadcast("error", { message: error.message }); return; }
          inserted += data?.length ?? 0;
          await broadcast("progress", {
            phase: "saving", processed: Math.min(i + chunk.length, mobileRows.length),
            total: mobileRows.length, inserted,
          });
        }

        // Build rejected_leads inserts (everything not mobile, including malformed/dupes)
        const rejRows: any[] = [];
        for (const t of tagged.filter((x) => !x.e164)) {
          rejRows.push({
            state: selectedState, phone_raw: t.raw, phone_normalized: null,
            phone_valid: false, phone_line_type: null, phone_carrier: null,
            phone_lookup_status: "skipped", phone_lookup_checked_at: null,
            rejection_reason: "malformed", import_batch_id: importBatchId,
            uploaded_file_name: fileName, original_row: t.row, source: "batch_upload",
          });
        }
        for (const t of dupesInFile) {
          rejRows.push({
            state: selectedState, phone_raw: t.raw, phone_normalized: t.e164,
            phone_valid: null, phone_line_type: null, phone_carrier: null,
            phone_lookup_status: "skipped",
            rejection_reason: "duplicate_in_file", import_batch_id: importBatchId,
            uploaded_file_name: fileName, original_row: t.row, source: "batch_upload",
          });
        }
        for (const t of dupesInDb) {
          rejRows.push({
            state: selectedState, phone_raw: t.raw, phone_normalized: t.e164,
            phone_valid: null, phone_line_type: null, phone_carrier: null,
            phone_lookup_status: "skipped",
            rejection_reason: "duplicate_in_db", import_batch_id: importBatchId,
            uploaded_file_name: fileName, original_row: t.row, source: "batch_upload",
          });
        }
        for (const r of rejected) {
          rejRows.push({
            state: selectedState, phone_raw: r.t.raw, phone_normalized: r.t.e164,
            phone_valid: r.result?.valid ?? null,
            phone_line_type: r.result?.line_type ?? null,
            phone_carrier: r.result?.carrier_name ?? null,
            phone_lookup_status: r.result?.status ?? "failed",
            phone_lookup_checked_at: r.result ? new Date().toISOString() : null,
            rejection_reason: r.reason, import_batch_id: importBatchId,
            uploaded_file_name: fileName, original_row: r.t.row, source: "batch_upload",
          });
        }
        for (let i = 0; i < rejRows.length; i += 500) {
          await supabase.from("rejected_leads").insert(rejRows.slice(i, i + 500));
        }

        await supabase.from("upload_logs").insert({
          state: selectedState, file_name: fileName,
          total_rows: rows.length, inserted_count: inserted,
          duplicate_count: dupesInDb.length + dupesInFile.length,
        });

        await broadcast("complete", {
          audit: { ...audit, inserted, rejected_total: rejRows.length },
          saved: true, inserted, import_batch_id: importBatchId,
        });
      } catch (e) {
        console.error("[audit-uploaded] error", e);
        await broadcast("error", { message: String((e as Error).message || e) });
      }
    })();

    // @ts-ignore Edge runtime
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);

    return new Response(JSON.stringify({ accepted: true, progress_id: progressId, import_batch_id: importBatchId }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function emptyAudit(batch: string, file: string, state: string) {
  return {
    import_batch_id: batch, file_name: file, state,
    total_rows: 0, unique_numbers: 0, malformed_blank: 0,
    duplicates_in_file: 0, duplicates_in_db: 0,
    mobile_approved: 0, landlines_rejected: 0, voip_rejected: 0,
    invalid_rejected: 0, unknown_rejected: 0, failed_lookups: 0,
    cache_hits: 0, new_lookups: 0, estimated_cost_usd: 0, rejected_sample: [],
  };
}

function buildLeadRow(opts: any) {
  const { t, selectedState, fileName, importBatchId, result,
    nameKey, firstNameKey, lastNameKey, addrKey, cityKey, zipKey, emailKey, officePhoneKey } = opts;
  const r = t.row;
  const fullName = nameKey ? cleanStr(r[nameKey]) : null;
  const firstRaw = firstNameKey ? cleanStr(r[firstNameKey]) : null;
  const lastRaw = lastNameKey ? cleanStr(r[lastNameKey]) : null;
  const composedFull = fullName || [firstRaw, lastRaw].filter(Boolean).join(" ") || null;
  const firstName = firstRaw ? firstRaw.split(/\s+/)[0] : (composedFull ? composedFull.split(/\s+/)[0] : null);
  const address = addrKey ? cleanStr(r[addrKey]) : null;
  const officePhone = officePhoneKey ? (toE164(r[officePhoneKey]) || cleanStr(r[officePhoneKey])) : null;

  return {
    phone_number: t.raw.trim(),
    phone_e164: t.e164,
    state: selectedState,
    name: composedFull,
    first_name: firstName,
    address,
    property_address: address,
    city: cityKey ? cleanStr(r[cityKey]) : null,
    zip: zipKey ? cleanStr(r[zipKey]) : null,
    email: emailKey ? cleanEmail(r[emailKey]) : null,
    office_phone: officePhone,
    source: "batch_upload",
    uploaded_file_name: fileName,
    phone_valid: result?.valid ?? true,
    phone_line_type: result?.line_type ?? "mobile",
    phone_carrier: result?.carrier_name ?? null,
    phone_lookup_status: result?.status ?? "success",
    phone_lookup_checked_at: new Date().toISOString(),
    import_batch_id: importBatchId,
  };
}
