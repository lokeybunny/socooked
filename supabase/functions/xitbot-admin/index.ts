// Admin-only endpoint to view XITBOT poll status and rotate the XITBOT_TOKEN.
// Stores rotated token in public.xitbot_admin_secrets (service-role only).
// The poller reads this override first, falling back to env XITBOT_TOKEN.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DISCORD_API = "https://discord.com/api/v10";
const SOURCE_CHANNEL_ID = "1512253930917068913";
const ADMIN_EMAIL = "warren@stu25.com";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: require warren@stu25.com
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user || userData.user.email !== ADMIN_EMAIL) {
      return json({ error: "Forbidden" }, 403);
    }

    const admin = createClient(SUPABASE_URL, SERVICE);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body?.action || "status";

    // Resolve effective token (override → env)
    const { data: secretRow } = await admin
      .from("xitbot_admin_secrets")
      .select("value, updated_at, updated_by")
      .eq("key", "XITBOT_TOKEN")
      .maybeSingle();
    const effectiveToken = secretRow?.value || Deno.env.get("XITBOT_TOKEN") || "";
    const source = secretRow?.value ? "db_override" : (Deno.env.get("XITBOT_TOKEN") ? "env" : "missing");

    if (action === "status") {
      let botInfo: any = null;
      let tokenValid = false;
      if (effectiveToken) {
        const me = await fetch(`${DISCORD_API}/users/@me`, {
          headers: { Authorization: `Bot ${effectiveToken}` },
        });
        tokenValid = me.ok;
        if (me.ok) botInfo = await me.json();
      }
      const { data: state } = await admin
        .from("xitbot_poll_state")
        .select("channel_id, last_message_id, updated_at")
        .eq("channel_id", SOURCE_CHANNEL_ID)
        .maybeSingle();

      return json({
        ok: true,
        source_channel_id: SOURCE_CHANNEL_ID,
        token_source: source,
        token_valid: tokenValid,
        token_updated_at: secretRow?.updated_at ?? null,
        bot: botInfo ? { id: botInfo.id, username: botInfo.username } : null,
        poll_state: state ?? null,
      });
    }

    if (action === "rotate") {
      const newToken = String(body?.token || "").trim();
      if (!newToken || newToken.length < 40) return json({ error: "Token looks invalid" }, 400);

      // Validate against Discord before saving
      const me = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bot ${newToken}` },
      });
      if (!me.ok) {
        const txt = await me.text();
        return json({ error: "Discord rejected the token", status: me.status, detail: txt }, 400);
      }
      const bot = await me.json();

      const { error: upErr } = await admin
        .from("xitbot_admin_secrets")
        .upsert(
          { key: "XITBOT_TOKEN", value: newToken, updated_at: new Date().toISOString(), updated_by: userData.user.id },
          { onConflict: "key" },
        );
      if (upErr) return json({ error: upErr.message }, 500);

      return json({ ok: true, bot: { id: bot.id, username: bot.username } });
    }

    if (action === "test_poll") {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/xitbot-channel-poll`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, "Content-Type": "application/json" },
        body: "{}",
      });
      const txt = await res.text();
      return json({ ok: res.ok, status: res.status, body: txt });
    }

    if (action === "clear_override") {
      await admin.from("xitbot_admin_secrets").delete().eq("key", "XITBOT_TOKEN");
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("[xitbot-admin] error", err?.message || err);
    return json({ error: err?.message || "unknown" }, 500);
  }
});
