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
import { VOICEMAIL_GURU_BYTES_BASE64 } from "./voicemail-guru-data.ts";
import { VVM_INCOMING_BYTES_BASE64 } from "./vvm-incoming-data.ts";
import { AUTO_CALLBACK_DROP_BYTES_BASE64 } from "./auto-callback-drop-data.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL_ENV = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY_ENV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sbAdmin = SUPABASE_URL_ENV && SUPABASE_SERVICE_ROLE_KEY_ENV
  ? createClient(SUPABASE_URL_ENV, SUPABASE_SERVICE_ROLE_KEY_ENV)
  : null;

async function loadFromDb(id: string): Promise<{ bytes: Uint8Array; mime: string; format: string } | null> {
  if (!sbAdmin) return null;
  const { data: row } = await sbAdmin
    .from("voicemail_recordings")
    .select("storage_path, mime_type, codec, sample_rate, channels")
    .eq("id", id)
    .maybeSingle();
  if (!row?.storage_path) return null;
  const { data: file, error } = await sbAdmin.storage.from("content-uploads").download(row.storage_path);
  if (error || !file) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    bytes,
    mime: row.mime_type || "audio/wav",
    format: `WAV / ${row.codec} / ${row.sample_rate}Hz / ${row.channels}ch`,
  };
}

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
  guru: {
    mime: "audio/wav",
    bytes: decodeBase64(VOICEMAIL_GURU_BYTES_BASE64),
    format: "WAV / pcm_mulaw / 8000Hz / mono",
  },
  "vvm-incoming": {
    mime: "audio/wav",
    bytes: decodeBase64(VVM_INCOMING_BYTES_BASE64),
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
    // Explicitly DO NOT advertise Range support. Twilio <Play> downloads the
    // file in one shot; advertising Range can cause Cloudflare/Twilio to
    // re-fetch byte ranges which has caused mid-playback "application error"
    // TTS interruptions when a chunk request times out.
    "Accept-Ranges": "none",
    // IMPORTANT: do NOT use `immutable` or long max-age. When an admin
    // re-uploads or activates a different voicemail recording, Twilio /
    // Cloudflare edge nodes were serving the previously cached audio for the
    // same `?id=<uuid>` URL, causing the wrong recording to play. Keep the
    // window short and require revalidation. We also rely on a `?v=<ts>`
    // cache-busting param from the webhook, but a conservative cache header
    // is the belt-and-suspenders fix.
    "Cache-Control": "public, max-age=30, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);

  // -------- Diagnostics --------
  if (url.searchParams.get("diag") === "1") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(FILES)) {
      const loaded = loadFile(key);
      out[key] = loaded
        ? {
            available: true,
            mime: loaded.mime,
            bytes: loaded.bytes.length,
            playback_url: `${url.origin}/functions/v1/powerdial-voicemail-audio?file=${key}`,
            format: loaded.format,
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

  // -------- Stream audio --------
  // ?id=<uuid> → load from voicemail_recordings table (uploaded by user)
  // ?file=warren → load embedded fallback bundle
  const recordingId = url.searchParams.get("id");
  let loaded: { bytes: Uint8Array; mime: string; format: string } | null = null;

  if (recordingId) {
    loaded = await loadFromDb(recordingId);
    if (!loaded) {
      return new Response(JSON.stringify({ ok: false, error: `recording not found: ${recordingId}` }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  } else {
    const fileKey = (url.searchParams.get("file") || "warren").toLowerCase();
    loaded = loadFile(fileKey);
    if (!loaded) {
      return new Response(JSON.stringify({ ok: false, error: `unknown file: ${fileKey}` }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  // NOTE: Range requests are intentionally ignored. Twilio's <Play> verb
  // does not require partial content, and serving 206 has caused mid-stream
  // playback failures (Twilio inserts "an application error has occurred"
  // TTS when a Range chunk fails or mismatches). Always return the full
  // file as a single 200 response so Twilio buffers it cleanly.
  return new Response(loaded.bytes, {
    status: 200,
    headers: audioHeaders(loaded.mime, loaded.bytes.length),
  });
});
