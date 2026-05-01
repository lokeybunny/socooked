ALTER TABLE public.missed_call_events
  ADD COLUMN IF NOT EXISTS voicemail_recording_url text,
  ADD COLUMN IF NOT EXISTS voicemail_recording_sid text,
  ADD COLUMN IF NOT EXISTS voicemail_duration integer,
  ADD COLUMN IF NOT EXISTS voicemail_transcription text,
  ADD COLUMN IF NOT EXISTS voicemail_received_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_missed_call_events_voicemail_sid
  ON public.missed_call_events(voicemail_recording_sid)
  WHERE voicemail_recording_sid IS NOT NULL;