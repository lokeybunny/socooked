CREATE TABLE public.voicemail_recordings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  original_filename text,
  original_format text,
  original_size bigint,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  mime_type text NOT NULL DEFAULT 'audio/wav',
  sample_rate integer NOT NULL DEFAULT 8000,
  channels integer NOT NULL DEFAULT 1,
  codec text NOT NULL DEFAULT 'pcm_mulaw',
  duration_sec numeric,
  file_size bigint,
  is_active boolean NOT NULL DEFAULT false,
  tts_fallback_text text,
  pause_before_sec integer NOT NULL DEFAULT 2,
  pause_after_sec integer NOT NULL DEFAULT 1,
  last_test_call_sid text,
  last_test_amd_result text,
  last_test_played_at timestamptz,
  last_fetch_status jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX voicemail_recordings_one_active
  ON public.voicemail_recordings (is_active)
  WHERE is_active = true;

ALTER TABLE public.voicemail_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view voicemail recordings"
  ON public.voicemail_recordings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert voicemail recordings"
  ON public.voicemail_recordings FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update voicemail recordings"
  ON public.voicemail_recordings FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated can delete voicemail recordings"
  ON public.voicemail_recordings FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER trg_voicemail_recordings_updated_at
  BEFORE UPDATE ON public.voicemail_recordings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();