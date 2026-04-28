# Voicemail Drop — Full Upload + Transcode System

The auto-reply (canned line + quoted inbound message) is already verified working. This plan covers the voicemail-drop overhaul.

## What we're building

A self-service admin page in PowerDial to upload any audio file, transcode it to Twilio-safe μ-law/8kHz/mono WAV, host it publicly with the right Content-Type, and validate end-to-end with a real test call.

## Architecture

```text
Admin UI (/powerdial/voicemails)
  │
  ├── upload (mp3/wav/m4a/webm)
  │       │
  │       ▼
  │   powerdial-voicemail-transcode (edge fn)
  │       • Decodes input via WASM ffmpeg (@ffmpeg/ffmpeg)
  │       • Re-encodes: -ar 8000 -ac 1 -c:a pcm_mulaw
  │       • Fallback:   -ar 8000 -ac 1 -sample_fmt s16 (PCM16)
  │       • Stores converted WAV in Supabase Storage
  │       • Writes row to voicemail_recordings table
  │
  ├── list / set-active / delete
  │
  ├── "Test File URL" → powerdial-voicemail-audio?action=test_url
  │       • HTTP GET probe → status, content-type, byte size
  │
  ├── "Test Voicemail Audio" → powerdial-voicemail-test-call (edge fn)
  │       • Places real Twilio call to operator's number
  │       • TwiML <Play> the active recording, logs result
  │
  └── Diagnostics panel (per recording)
        original format / converted format / sample rate / channels /
        codec / duration / file size / public URL / MIME / last twilio
        fetch result / last call SID / AMD outcome / playback timestamp
```

## Database

New table `voicemail_recordings`:
- id, name, original_filename, original_format, original_size
- storage_path, public_url, mime_type ('audio/wav')
- sample_rate (8000), channels (1), codec ('pcm_mulaw' | 'pcm_s16le')
- duration_sec, file_size, is_active (only one true), tts_fallback_text
- pause_before_sec (default 2), pause_after_sec (default 1)
- last_test_call_sid, last_test_amd_result, last_test_played_at, last_fetch_status
- created_at, updated_at, created_by

RLS: authenticated users only.

Storage: reuse `content-uploads` bucket under `voicemails/<uuid>.wav` (public).

## Edge Functions

1. **powerdial-voicemail-transcode** (POST) — accepts multipart upload, runs WASM ffmpeg, stores WAV, inserts row, returns full diagnostics.
2. **powerdial-voicemail-audio** (existing) — extend to also stream from `voicemail_recordings` by id; keep existing embedded fallback.
3. **powerdial-voicemail-test-call** (POST) — uses Twilio API to place a call to the operator's number with TwiML that plays the active recording (or TTS fallback). Records call SID + AMD result.
4. **powerdial-webhook** (existing) — already wired to play the audio URL when AMD says machine. Update to read the active recording's `pause_before_sec` / `pause_after_sec` and to fall back to `<Say>` TTS if `audio_play_failed=true` from a previous attempt.

## Admin UI

New route `/powerdial/voicemails` (linked from PowerDial page):
- Upload zone (drag/drop) with format hint
- Recordings table: name, format badge, duration, size, active toggle, actions
- Per-row diagnostics drawer (all metadata + last test call)
- Two action buttons: "Test File URL" and "Test Voicemail Audio (call my phone)"
- Phone input for the test target (defaults to operator cell)
- TTS fallback editor (textarea) per recording
- TCPA compliance banner at the top

## Technical notes

- WASM ffmpeg in Deno: use `https://esm.sh/@ffmpeg/ffmpeg@0.12` with `coreURL` pointing at the matching `@ffmpeg/core@0.12` ESM. If WASM proves unstable in Edge runtime within the timeout, fall back to a pure-Deno μ-law encoder (decode WAV/PCM only — reject mp3/m4a with a clear error suggesting they upload WAV).
- Server-side validation: reject files >10 MB, reject non-audio MIME.
- Pre-signed test plays the file via Twilio REST API call to operator's own number — not a campaign call.
- Compliance: surface a static TCPA notice in the UI; log every test call into `communications`.

## Out of scope

- Campaign-level opt-out enforcement (already lives in PowerDial main flow).
- Multi-language TTS voices (default `Polly.Joanna`).
