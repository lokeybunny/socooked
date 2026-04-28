// Twilio-safe voicemail audio host.
//
// Why this exists:
//   The voicemail file in Supabase Storage is served with
//   `Content-Type: application/octet-stream` (not audio/*), which causes
//   Twilio to fail decoding and play STATIC into the recipient's mailbox.
//   This function streams the WAV bytes inline with the correct headers
//   so Twilio always gets a clean, properly typed audio stream.
//
// Audio format (Twilio-recommended for telephony playback):
//   - WAV container
//   - PCM μ-law (pcm_mulaw)
//   - 8000 Hz sample rate
//   - Mono
//   Generated via:
//     ffmpeg -i src.mp3 -ar 8000 -ac 1 -c:a pcm_mulaw voicemail-warren.wav
//
// Endpoints:
//   GET  /powerdial-voicemail-audio                → streams the WAV (audio/wav)
//   GET  /powerdial-voicemail-audio?file=warren    → same (default file)
//   GET  /powerdial-voicemail-audio?diag=1         → JSON diagnostics
//   POST /powerdial-voicemail-audio (action=test_url)
//        → fetches the playback URL, validates HTTP 200 + audio/* content-type
//
// This URL should be set as the voicemail_drop_url in PowerDial settings:
//   https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/powerdial-voicemail-audio

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

import { VOICEMAIL_WARREN_BYTES_BASE64 } from "./voicemail-warren-data.ts";

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Files embedded as base64 inside the bundle so Twilio always gets a valid
// audio response (no dependency on storage MIME types or file presence).
const FILES: Record<string, { mime: string; bytes: Uint8Array; format: string }> = {
  warren: {
    mime: "audio/wav",
    bytes: decodeBase64(VOICEMAIL_WARREN_BYTES_BASE64),
    format: "WAV / pcm_mulaw / 8000Hz / mono",
  },
};

function loadFile(key: string): { bytes: Uint8Array; mime: string; format: string } | null {
  return FILES[key] || null;
}

function audioHeaders(mime: string, length: number) {
  return {
    ...CORS,
    "Content-Type": mime,
    "Content-Length": String(length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);

  // -------- Diagnostics --------
  if (url.searchParams.get("diag") === "1") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(FILES)) {
      const loaded = await loadFile(key);
      out[key] = loaded
        ? {
            available: true,
            mime: entry.mime,
            bytes: loaded.bytes.length,
            playback_url: `${url.origin}/functions/v1/powerdial-voicemail-audio?file=${key}`,
            format: "WAV / pcm_mulaw / 8000Hz / mono",
          }
        : { available: false };
    }
    return new Response(JSON.stringify({ ok: true, files: out }, null, 2), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // -------- Test a remote URL (admin diagnostics) --------
  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const action = String(body?.action || "");
      if (action === "test_url") {
        const target = String(body?.url || "");
        if (!target) {
          return new Response(JSON.stringify({ ok: false, error: "url required" }), {
            status: 400,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }
        try {
          const head = await fetch(target, { method: "GET" });
          const buf = await head.arrayBuffer();
          const ct = head.headers.get("content-type") || "";
          const size = buf.byteLength;
          const ok = head.ok && size > 0 && /audio\//i.test(ct);
          return new Response(
            JSON.stringify({
              ok,
              status: head.status,
              content_type: ct,
              bytes: size,
              twilio_safe: ok,
              hints: ok
                ? []
                : [
                    head.ok ? null : `HTTP ${head.status}`,
                    size > 0 ? null : "empty body",
                    /audio\//i.test(ct) ? null : `content-type "${ct}" is not audio/* — Twilio may fail to decode`,
                  ].filter(Boolean),
            }, null, 2),
            { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        } catch (err) {
          return new Response(
            JSON.stringify({ ok: false, error: String(err) }),
            { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        }
      }
      return new Response(JSON.stringify({ ok: false, error: "unknown action" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  // -------- Stream audio (default) --------
  const fileKey = (url.searchParams.get("file") || "warren").toLowerCase();
  const loaded = await loadFile(fileKey);
  if (!loaded) {
    return new Response(JSON.stringify({ ok: false, error: `unknown file: ${fileKey}` }), {
      status: 404,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Honor Range requests for Twilio (returns 206 with the slice).
  const rangeHeader = req.headers.get("range");
  if (rangeHeader) {
    const m = /bytes=(\d+)-(\d+)?/i.exec(rangeHeader);
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : loaded.bytes.length - 1;
      if (start <= end && start < loaded.bytes.length) {
        const slice = loaded.bytes.subarray(start, end + 1);
        return new Response(slice, {
          status: 206,
          headers: {
            ...audioHeaders(loaded.mime, slice.length),
            "Content-Range": `bytes ${start}-${end}/${loaded.bytes.length}`,
          },
        });
      }
    }
  }

  return new Response(loaded.bytes, {
    status: 200,
    headers: audioHeaders(loaded.mime, loaded.bytes.length),
  });
});
