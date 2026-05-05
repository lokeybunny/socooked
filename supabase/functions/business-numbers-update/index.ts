// Globally update one of the business phone numbers (cell, office, twilio_landline).
// - Updates app_settings.business_numbers
// - Replaces every occurrence of the old number across ALL app_settings.value JSON
// - If the office number changed, updates voidfix_missed_call.forward_to
// - If the twilio landline changed, re-points Twilio voice webhook (already auto-routes
//   to twilio-inbound-call) — no action needed beyond the new SID resolution.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function normalize(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return `+${d}`;
}

function variants(e164: string): string[] {
  const digits = e164.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  const a = last10.slice(0, 3);
  const b = last10.slice(3, 6);
  const c = last10.slice(6);
  return Array.from(new Set([
    e164,                   // +14802200405
    digits,                 // 14802200405
    last10,                 // 4802200405
    `(${a}) ${b}-${c}`,     // (480) 220-0405
    `${a}-${b}-${c}`,       // 480-220-0405
    `${a}.${b}.${c}`,       // 480.220.0405
    `+1 ${a} ${b} ${c}`,
    `1${last10}`,
    `1-${a}-${b}-${c}`,
    `tel:+1${last10}`,
    `tel:${e164}`,
  ])).filter(Boolean);
}

function deepReplace(value: any, replacements: Array<[string, string]>): any {
  if (value == null) return value;
  if (typeof value === "string") {
    let out = value;
    for (const [from, to] of replacements) {
      if (!from) continue;
      out = out.split(from).join(to);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => deepReplace(v, replacements));
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) out[k] = deepReplace(value[k], replacements);
    return out;
  }
  return value;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    const role = String(body?.role || "").trim(); // 'cell' | 'office' | 'twilio_landline'
    const newNumber = normalize(String(body?.new_number || ""));
    const oldOverride = body?.old_number ? normalize(String(body.old_number)) : "";

    if (!["cell", "office", "twilio_landline"].includes(role)) {
      return json({ ok: false, error: "invalid_role" }, 400);
    }
    if (!/^\+\d{11,15}$/.test(newNumber)) {
      return json({ ok: false, error: "invalid_new_number" }, 400);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load current business_numbers row
    const { data: current } = await sb
      .from("app_settings")
      .select("value")
      .eq("key", "business_numbers")
      .maybeSingle();

    const currentVal = (current?.value as any) || {};
    const oldNumber = oldOverride || normalize(currentVal[role] || "");
    if (!oldNumber) {
      return json({ ok: false, error: "no_existing_number_for_role" }, 400);
    }
    if (oldNumber === newNumber) {
      return json({ ok: true, unchanged: true });
    }

    // Build search/replace pairs across formatting variants
    const oldVariants = variants(oldNumber);
    const newVariants = variants(newNumber);
    const pairs: Array<[string, string]> = oldVariants.map((v, i) => [v, newVariants[i]]);

    // 1) Update business_numbers row
    const newBusiness = {
      ...currentVal,
      [role]: newNumber,
      updated_at: new Date().toISOString(),
    };
    await sb.from("app_settings").upsert({ key: "business_numbers", value: newBusiness });

    // 2) Walk every app_settings row and deep-replace
    const { data: allSettings } = await sb.from("app_settings").select("key, value");
    const updatedKeys: string[] = [];
    for (const row of allSettings || []) {
      if (row.key === "business_numbers") continue;
      const before = JSON.stringify(row.value);
      const after = deepReplace(row.value, pairs);
      const afterStr = JSON.stringify(after);
      if (before !== afterStr) {
        await sb.from("app_settings").upsert({ key: row.key, value: after });
        updatedKeys.push(row.key);
      }
    }

    // 3) Office change → ensure voidfix_missed_call.forward_to is updated explicitly
    if (role === "office") {
      const { data: vf } = await sb
        .from("app_settings").select("value").eq("key", "voidfix_missed_call").maybeSingle();
      const vfVal = (vf?.value as any) || {};
      if (normalize(vfVal.forward_to || "") !== newNumber) {
        await sb.from("app_settings").upsert({
          key: "voidfix_missed_call",
          value: { ...vfVal, forward_to: newNumber, updated_at: new Date().toISOString() },
        });
        if (!updatedKeys.includes("voidfix_missed_call")) updatedKeys.push("voidfix_missed_call");
      }
    }

    return json({
      ok: true,
      role,
      old: oldNumber,
      new: newNumber,
      app_settings_keys_updated: updatedKeys,
    });
  } catch (e: any) {
    console.error("[business-numbers-update]", e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
