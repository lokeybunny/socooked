// Streams a remote video back with permissive CORS so the browser can
// read it into a canvas without tainting. Used by GrabFrameDialog as a
// fallback when the source URL doesn't expose CORS headers.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Expose-Headers': 'content-length, content-range, accept-ranges, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url).searchParams.get('url');
    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const range = req.headers.get('range');
    const upstream = await fetch(url, {
      headers: range ? { range } : undefined,
    });
    const headers = new Headers(corsHeaders);
    const ct = upstream.headers.get('content-type');
    if (ct) headers.set('Content-Type', ct);
    const cl = upstream.headers.get('content-length');
    if (cl) headers.set('Content-Length', cl);
    const cr = upstream.headers.get('content-range');
    if (cr) headers.set('Content-Range', cr);
    const ar = upstream.headers.get('accept-ranges');
    if (ar) headers.set('Accept-Ranges', ar);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
