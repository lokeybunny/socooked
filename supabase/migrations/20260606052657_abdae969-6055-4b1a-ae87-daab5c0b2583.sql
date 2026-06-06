
-- recording_jobs: add columns autor-api & launcher expect
ALTER TABLE public.recording_jobs
  ADD COLUMN IF NOT EXISTS job_id uuid GENERATED ALWAYS AS (id) STORED,
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'axiom',
  ADD COLUMN IF NOT EXISTS discord_server_id text,
  ADD COLUMN IF NOT EXISTS discord_server_name text,
  ADD COLUMN IF NOT EXISTS discord_channel_name text,
  ADD COLUMN IF NOT EXISTS recording_name text,
  ADD COLUMN IF NOT EXISTS stop_phrase text DEFAULT 'all supply has been sold',
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS storage_size bigint,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS start_time timestamptz,
  ADD COLUMN IF NOT EXISTS end_time timestamptz,
  ADD COLUMN IF NOT EXISTS detected_phrase text,
  ADD COLUMN IF NOT EXISTS token_name text,
  ADD COLUMN IF NOT EXISTS contract_address text,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS recording_jobs_job_id_idx ON public.recording_jobs(job_id);
CREATE INDEX IF NOT EXISTS recording_jobs_discord_message_id_idx ON public.recording_jobs(discord_message_id);

-- recording_events: extra fields autor-api writes
ALTER TABLE public.recording_events
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS metadata_json jsonb DEFAULT '{}'::jsonb;

-- recording_action_logs: extra fields autor-api writes
ALTER TABLE public.recording_action_logs
  ADD COLUMN IF NOT EXISTS message text;

-- recording_settings: per-channel watch rules
CREATE TABLE IF NOT EXISTS public.recording_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id text NOT NULL,
  guild_name text,
  channel_id text NOT NULL,
  channel_name text,
  stop_phrase text NOT NULL DEFAULT 'all supply has been sold',
  max_duration_minutes integer NOT NULL DEFAULT 120,
  max_retries integer NOT NULL DEFAULT 3,
  url_patterns text[] NOT NULL DEFAULT ARRAY['axiom.trade'],
  watch_enabled boolean NOT NULL DEFAULT true,
  retry_enabled boolean NOT NULL DEFAULT true,
  auto_upload boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, channel_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recording_settings TO authenticated;
GRANT ALL ON public.recording_settings TO service_role;
ALTER TABLE public.recording_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins/managers manage recording_settings"
  ON public.recording_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_recording_settings_updated_at
  BEFORE UPDATE ON public.recording_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
