// Voicemail audio transcoder.
//
// Architecture: the BROWSER decodes any input audio (mp3/wav/m4a/webm) via
// Web Audio API (which natively handles all those formats), resamples to
// 8000 Hz mono Float32, and POSTs raw PCM samples here. This function:
//   1. Validates the PCM payload
//   2. Encodes Float32 → μ-law bytes (G.711, RFC 1057)
//   3. Wraps with a μ-law WAV header (8000 Hz, mono, format code 7)
//   4. Uploads the result to Supabase Storage (public bucket)
//   5. Inserts a row in voicemail_recordings
//
// This sidesteps the lack of FFmpeg in Deno Edge Runtime while still
// producing bit-perfect Twilio-safe audio (WAV / pcm_mulaw / 8000Hz / mono).
//
// POST body (JSON):
//   {
//     name: string,
//     original_filename: string,
//     original_format: string,        // mime type
//     original_size: number,
//     duration_sec: number,
//     pcm_base64: string,             // Float32Array, little-endian, 8000 Hz mono
//     codec?: 'pcm_mulaw' | 'pcm_s16le',  // default pcm_mulaw
//     tts_fallback_text?: string,
//     set_active?: boolean,           // mark this as the active recording
//   }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SAMPLE_RATE = 8000;
const CHANNELS = 1;

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Float32 [-1,1] -> μ-law byte (G.711)
function linearToMuLaw(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  let s = Math.max(-1, Math.min(1, sample));
  let pcm = Math.round(s * 32767);
  let sign = (pcm >> 8) & 0x80;
  if (sign !== 0) pcm = -pcm;
  if (pcm > CLIP) pcm = CLIP;
  pcm += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (pcm & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function encodeMuLaw(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = linearToMuLaw(samples[i]);
  return out;
}

function encodePcm16(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

// Build a WAV header.
//   formatCode: 7 = μ-law, 1 = PCM16
function wavHeader(dataLen: number, formatCode: number, bitsPerSample: number): Uint8Array {
  const byteRate = SAMPLE_RATE * CHANNELS * (bitsPerSample / 8);
  const blockAlign = CHANNELS * (bitsPerSample / 8);
  const buf = new ArrayBuffer(44);
  const v = new DataView(buf);
  const w = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + dataLen, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, formatCode, true);
  v.setUint16(22, CHANNELS, true);
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitsPerSample, true);
  w(36, "data");
  v.setUint32(40, dataLen, true);
  return new Uint8Array(buf);
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonResp({ ok: false, error: "POST required" }, 405);

  // Auth: require an authenticated user
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResp({ ok: false, error: "auth required" }, 401);
  const { data: userData } = await sb.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return jsonResp({ ok: false, error: "invalid token" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResp({ ok: false, error: "invalid JSON" }, 400);
  }

  const name = String(body?.name || "").trim() || "Untitled voicemail";
  const originalFilename = String(body?.original_filename || "");
  const originalFormat = String(body?.original_format || "");
  const originalSize = Number(body?.original_size || 0);
  const durationSec = Number(body?.duration_sec || 0);
  const codec: "pcm_mulaw" | "pcm_s16le" = body?.codec === "pcm_s16le" ? "pcm_s16le" : "pcm_mulaw";
  const ttsFallbackText = body?.tts_fallback_text ? String(body.tts_fallback_text) : null;
  const setActive = Boolean(body?.set_active);
  const pcmBase64 = String(body?.pcm_base64 || "");

  if (!pcmBase64) return jsonResp({ ok: false, error: "pcm_base64 required" }, 400);
  if (durationSec > 60) return jsonResp({ ok: false, error: "Recording must be 60s or less" }, 400);

  // Decode Float32 PCM (little-endian)
  let pcmBytes: Uint8Array;
  try {
    pcmBytes = decodeBase64(pcmBase64);
  } catch {
    return jsonResp({ ok: false, error: "pcm_base64 not valid base64" }, 400);
  }
  if (pcmBytes.length % 4 !== 0) {
    return jsonResp({ ok: false, error: "PCM byte length must be a multiple of 4 (Float32)" }, 400);
  }
  const samples = new Float32Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.length / 4);
  if (samples.length === 0) return jsonResp({ ok: false, error: "empty PCM" }, 400);
  if (samples.length > SAMPLE_RATE * 60) {
    return jsonResp({ ok: false, error: "too many samples (>60s @ 8kHz)" }, 400);
  }

  // Encode to target codec
  let audioBytes: Uint8Array;
  let bitsPerSample: number;
  let formatCode: number;
  if (codec === "pcm_s16le") {
    audioBytes = encodePcm16(samples);
    bitsPerSample = 16;
    formatCode = 1;
  } else {
    audioBytes = encodeMuLaw(samples);
    bitsPerSample = 8;
    formatCode = 7;
  }
  const wavBytes = concat(wavHeader(audioBytes.length, formatCode, bitsPerSample), audioBytes);

  // Upload to storage
  const id = crypto.randomUUID();
  const storagePath = `voicemails/${id}.wav`;
  const { error: upErr } = await sb.storage
    .from("content-uploads")
    .upload(storagePath, wavBytes, { contentType: "audio/wav", upsert: false });
  if (upErr) return jsonResp({ ok: false, error: `storage upload failed: ${upErr.message}` }, 500);

  const { data: pub } = sb.storage.from("content-uploads").getPublicUrl(storagePath);
  // We use our own audio host (correct Content-Type + Range support) instead of
  // the raw storage URL. The host streams by recording id.
  const playbackUrl = `${SUPABASE_URL}/functions/v1/powerdial-voicemail-audio?id=${id}`;

  // If set_active, clear existing active flag first
  if (setActive) {
    await sb.from("voicemail_recordings").update({ is_active: false }).eq("is_active", true);
  }

  const { data: row, error: insErr } = await sb
    .from("voicemail_recordings")
    .insert({
      id,
      name,
      original_filename: originalFilename || null,
      original_format: originalFormat || null,
      original_size: originalSize || null,
      storage_path: storagePath,
      public_url: playbackUrl,
      mime_type: "audio/wav",
      sample_rate: SAMPLE_RATE,
      channels: CHANNELS,
      codec,
      duration_sec: durationSec || null,
      file_size: wavBytes.length,
      is_active: setActive,
      tts_fallback_text: ttsFallbackText,
      created_by: user.id,
    })
    .select()
    .single();
  if (insErr) {
    await sb.storage.from("content-uploads").remove([storagePath]).catch(() => {});
    return jsonResp({ ok: false, error: `insert failed: ${insErr.message}` }, 500);
  }

  return jsonResp({
    ok: true,
    recording: row,
    storage_url: pub.publicUrl,
    playback_url: playbackUrl,
  });
});
