
-- AutoR recording jobs
CREATE TABLE public.recording_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  discord_channel_id TEXT,
  discord_message_id TEXT,
  discord_user_id TEXT,
  discord_username TEXT,
  browserbase_session_id TEXT,
  browserbase_live_view_url TEXT,
  recording_url TEXT,
  storage_path TEXT,
  detected_phrases JSONB DEFAULT '[]'::jsonb,
  token_data JSONB DEFAULT '{}'::jsonb,
  meta JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX recording_jobs_status_idx ON public.recording_jobs(status);
CREATE INDEX recording_jobs_created_at_idx ON public.recording_jobs(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recording_jobs TO authenticated;
GRANT ALL ON public.recording_jobs TO service_role;
ALTER TABLE public.recording_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins/managers manage recording_jobs"
  ON public.recording_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_recording_jobs_updated_at
  BEFORE UPDATE ON public.recording_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-job events timeline
CREATE TABLE public.recording_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.recording_jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX recording_events_job_id_idx ON public.recording_events(job_id, created_at DESC);

GRANT SELECT, INSERT ON public.recording_events TO authenticated;
GRANT ALL ON public.recording_events TO service_role;
ALTER TABLE public.recording_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins/managers read recording_events"
  ON public.recording_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Admins/managers insert recording_events"
  ON public.recording_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- User-initiated action logs
CREATE TABLE public.recording_action_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES public.recording_jobs(id) ON DELETE CASCADE,
  user_id UUID,
  action TEXT NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX recording_action_logs_job_id_idx ON public.recording_action_logs(job_id, created_at DESC);

GRANT SELECT, INSERT ON public.recording_action_logs TO authenticated;
GRANT ALL ON public.recording_action_logs TO service_role;
ALTER TABLE public.recording_action_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins/managers read recording_action_logs"
  ON public.recording_action_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Authenticated insert own recording_action_logs"
  ON public.recording_action_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.recording_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recording_events;

-- Storage policies for autor-recordings bucket (private)
CREATE POLICY "Admins/managers read autor-recordings"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'autor-recordings' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));
CREATE POLICY "Admins/managers write autor-recordings"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'autor-recordings' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));
CREATE POLICY "Admins/managers update autor-recordings"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'autor-recordings' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));
CREATE POLICY "Admins/managers delete autor-recordings"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'autor-recordings' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));
