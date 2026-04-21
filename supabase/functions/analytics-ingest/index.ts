// Public analytics ingestion endpoint - accepts beacons from landing pages
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function parseUA(ua: string) {
  const u = (ua || "").toLowerCase();
  let device = "desktop";
  if (/mobile|iphone|android.*mobile/.test(u)) device = "mobile";
  else if (/ipad|tablet|android(?!.*mobile)/.test(u)) device = "tablet";
  let browser = "Other";
  if (u.includes("edg/")) browser = "Edge";
  else if (u.includes("chrome/")) browser = "Chrome";
  else if (u.includes("firefox/")) browser = "Firefox";
  else if (u.includes("safari/")) browser = "Safari";
  let os = "Other";
  if (u.includes("windows")) os = "Windows";
  else if (u.includes("mac os")) os = "macOS";
  else if (u.includes("iphone") || u.includes("ipad")) os = "iOS";
  else if (u.includes("android")) os = "Android";
  else if (u.includes("linux")) os = "Linux";
  return { device, browser, os };
}

async function getGeo(ip: string) {
  if (!ip || ip === "unknown") return {};
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`);
    if (!r.ok) return {};
    const j = await r.json();
    return { country: j.country_name, region: j.region, city: j.city };
  } catch {
    return {};
  }
}

async function hashIp(ip: string): Promise<string> {
  const buf = new TextEncoder().encode(ip + "salt-stu25");
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { type } = body;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const ipHash = await hashIp(ip);

    if (type === "session_start") {
      const { visitor_id, landing_path, referrer, utm, user_agent } = body;
      if (!visitor_id || !landing_path) return new Response(JSON.stringify({ error: "missing" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { device, browser, os } = parseUA(user_agent || "");
      const geo = await getGeo(ip);
      const refDomain = referrer ? (() => { try { return new URL(referrer).hostname; } catch { return null; } })() : null;
      const { data, error } = await supabase.from("analytics_sessions").insert({
        visitor_id,
        landing_path,
        exit_path: landing_path,
        referrer,
        referrer_domain: refDomain,
        utm_source: utm?.source,
        utm_medium: utm?.medium,
        utm_campaign: utm?.campaign,
        utm_content: utm?.content,
        utm_term: utm?.term,
        device_type: device,
        browser,
        os,
        user_agent,
        ip_hash: ipHash,
        ...geo,
        page_views_count: 1,
      }).select("id").single();
      if (error) throw error;
      // also record landing pageview
      await supabase.from("analytics_pageviews").insert({
        session_id: data.id, visitor_id, path: landing_path, referrer,
      });
      return new Response(JSON.stringify({ session_id: data.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === "pageview") {
      const { session_id, visitor_id, path, title, referrer } = body;
      if (!session_id) return new Response(JSON.stringify({ error: "missing session" }), { status: 400, headers: corsHeaders });
      await supabase.from("analytics_pageviews").insert({ session_id, visitor_id, path, title, referrer });
      // bump session
      const { data: sess } = await supabase.from("analytics_sessions").select("page_views_count, started_at").eq("id", session_id).maybeSingle();
      const pv = (sess?.page_views_count || 0) + 1;
      const dur = sess?.started_at ? Math.floor((Date.now() - new Date(sess.started_at).getTime()) / 1000) : 0;
      await supabase.from("analytics_sessions").update({
        last_seen_at: new Date().toISOString(),
        exit_path: path,
        page_views_count: pv,
        duration_seconds: dur,
        is_bounce: pv <= 1,
      }).eq("id", session_id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === "event") {
      const { session_id, visitor_id, event_name, event_label, event_value, path, meta } = body;
      if (!event_name || !visitor_id) return new Response(JSON.stringify({ error: "missing" }), { status: 400, headers: corsHeaders });
      await supabase.from("analytics_events").insert({
        session_id, visitor_id, event_name, event_label, event_value, path, meta: meta || {},
      });
      if (session_id) {
        const { data: sess } = await supabase.from("analytics_sessions").select("events_count").eq("id", session_id).maybeSingle();
        await supabase.from("analytics_sessions").update({
          events_count: (sess?.events_count || 0) + 1,
          last_seen_at: new Date().toISOString(),
        }).eq("id", session_id);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === "heartbeat") {
      const { session_id, time_on_page, scroll_depth, pageview_id } = body;
      if (!session_id) return new Response(JSON.stringify({ error: "missing" }), { status: 400, headers: corsHeaders });
      await supabase.from("analytics_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", session_id);
      if (pageview_id) {
        await supabase.from("analytics_pageviews").update({
          time_on_page_seconds: time_on_page || 0,
          scroll_depth_pct: scroll_depth || 0,
        }).eq("id", pageview_id);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "unknown type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analytics-ingest error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
