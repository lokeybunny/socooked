/**
 * LeadsRain HTTPS → HTTP proxy (Cloudflare Worker)
 *
 * Forwards requests from your HTTPS app to LeadsRain's HTTP-only
 * shards (s1/s2/s3.leadsrain.com), bypassing browser mixed-content
 * blocks and Supabase Edge cloud-egress restrictions.
 *
 * Deploy in ~2 min:
 *   1. npm i -g wrangler
 *   2. cd cloudflare-worker/leadsrain-proxy
 *   3. wrangler login
 *   4. wrangler deploy
 *   5. Copy the worker URL (e.g. https://leadsrain-proxy.<you>.workers.dev)
 *      and paste it into Voice Drops → Settings → "LeadsRain Proxy URL".
 *
 * Optional: set ALLOWED_ORIGIN env var via `wrangler secret put ALLOWED_ORIGIN`
 * to restrict CORS to your app's domain. Defaults to "*".
 *
 * Usage from the browser:
 *   POST https://<worker>/rvm/api/campaign/view_api
 *   POST https://<worker>/rvm/api/leadlist/view_api
 *   (any LeadsRain path is forwarded — body & headers passthrough)
 *
 * Optional query param `?shard=s1|s2|s3` pins to one shard;
 * otherwise s2 → s1 → s3 fallback is attempted.
 */

const SHARDS = ["s2", "s1", "s3"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowOrigin = env.ALLOWED_ORIGIN || "*";

    const cors = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({ ok: true, service: "leadsrain-proxy", shards: SHARDS }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Determine which shards to try
    const pinned = url.searchParams.get("shard");
    const shards = pinned && SHARDS.includes(pinned) ? [pinned] : SHARDS;

    // Read body once so we can retry across shards
    const bodyBuf = ["GET", "HEAD"].includes(request.method)
      ? null
      : await request.arrayBuffer();

    // Pass through most headers, but force a clean Host
    const fwdHeaders = new Headers();
    for (const [k, v] of request.headers) {
      const kl = k.toLowerCase();
      if (["host", "cf-connecting-ip", "cf-ray", "cf-visitor", "x-forwarded-for", "x-forwarded-proto", "x-real-ip"].includes(kl)) continue;
      fwdHeaders.set(k, v);
    }
    if (!fwdHeaders.has("Content-Type") && bodyBuf && bodyBuf.byteLength > 0) {
      fwdHeaders.set("Content-Type", "application/json");
    }

    // Strip our own ?shard param before forwarding
    const fwdSearch = new URLSearchParams(url.search);
    fwdSearch.delete("shard");
    const qs = fwdSearch.toString();

    let lastErr = null;
    for (const shard of shards) {
      const target = `http://${shard}.leadsrain.com${url.pathname}${qs ? `?${qs}` : ""}`;
      try {
        const resp = await fetch(target, {
          method: request.method,
          headers: fwdHeaders,
          body: bodyBuf,
          // 15s timeout via AbortController
          signal: AbortSignal.timeout(15000),
        });

        const respHeaders = new Headers(resp.headers);
        for (const [k, v] of Object.entries(cors)) respHeaders.set(k, v);
        respHeaders.set("X-Proxy-Shard", shard);

        return new Response(resp.body, {
          status: resp.status,
          statusText: resp.statusText,
          headers: respHeaders,
        });
      } catch (e) {
        lastErr = e;
        // try next shard
      }
    }

    return new Response(
      JSON.stringify({
        error: "All LeadsRain shards unreachable from worker",
        detail: String(lastErr?.message || lastErr),
        tried: shards,
      }),
      { status: 502, headers: { ...cors, "Content-Type": "application/json" } }
    );
  },
};
