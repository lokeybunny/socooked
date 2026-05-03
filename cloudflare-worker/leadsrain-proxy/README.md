# LeadsRain HTTPS Proxy (Cloudflare Worker)

A tiny worker that forwards HTTPS requests from your app to LeadsRain's
HTTP-only shards (`s1/s2/s3.leadsrain.com`). This bypasses two blockers:

1. **Browser mixed content** — HTTPS pages can't call HTTP endpoints.
2. **Supabase Edge egress** — Lovable Cloud egress is blocked from the shards.

## Deploy in 2 minutes

```bash
npm i -g wrangler            # one-time
cd cloudflare-worker/leadsrain-proxy
wrangler login               # browser flow, free Cloudflare account is fine
wrangler deploy              # prints your worker URL
```

You'll get a URL like `https://leadsrain-proxy.<your-handle>.workers.dev`.

## Wire it up

1. Open **Voice Drops → Settings**.
2. Paste the worker URL into **LeadsRain Proxy URL**.
3. Save.
4. Click **Import from LeadsRain** — the request now flows
   `Browser → HTTPS Worker → HTTP LeadsRain shard` and back.

## Optional hardening

Restrict CORS to your domain:

```bash
wrangler secret put ALLOWED_ORIGIN
# enter: https://socooked.lovable.app
```

## How it works

- Any path you POST to the worker is forwarded verbatim to
  `http://s{2,1,3}.leadsrain.com<path>`.
- Shards are tried in order `s2 → s1 → s3` until one responds.
- Pin a shard by appending `?shard=s1`.
- 15s timeout per shard, returns 502 with detail if all fail.
