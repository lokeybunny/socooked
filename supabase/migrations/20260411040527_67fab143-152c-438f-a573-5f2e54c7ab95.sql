
-- Generation Jobs table
CREATE TABLE public.generation_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  task_type text NOT NULL DEFAULT 't2v',
  prompt text NOT NULL,
  negative_prompt text,
  settings_json jsonb NOT NULL DEFAULT '{}',
  input_image_url text,
  input_audio_url text,
  output_video_url text,
  output_thumbnail_url text,
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  worker_job_id text,
  backend_logs text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs" ON public.generation_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own jobs" ON public.generation_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own jobs" ON public.generation_jobs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own jobs" ON public.generation_jobs FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_generation_jobs_updated_at BEFORE UPDATE ON public.generation_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_jobs;

-- Generation Presets table
CREATE TABLE public.generation_presets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  task_type text NOT NULL DEFAULT 't2v',
  preset_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.generation_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own presets" ON public.generation_presets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own presets" ON public.generation_presets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own presets" ON public.generation_presets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own presets" ON public.generation_presets FOR DELETE USING (auth.uid() = user_id);

-- Studio Settings table
CREATE TABLE public.studio_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  branding_json jsonb NOT NULL DEFAULT '{"app_name":"Warren Studio","accent_color":"#8B5CF6"}',
  backend_config_json jsonb NOT NULL DEFAULT '{}',
  default_presets_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings" ON public.studio_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own settings" ON public.studio_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.studio_settings FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_studio_settings_updated_at BEFORE UPDATE ON public.studio_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for outputs
INSERT INTO storage.buckets (id, name, public) VALUES ('studio-outputs', 'studio-outputs', true);

CREATE POLICY "Authenticated users can upload studio outputs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'studio-outputs' AND auth.role() = 'authenticated');
CREATE POLICY "Anyone can view studio outputs" ON storage.objects FOR SELECT USING (bucket_id = 'studio-outputs');
CREATE POLICY "Users can delete own studio outputs" ON storage.objects FOR DELETE USING (bucket_id = 'studio-outputs' AND auth.role() = 'authenticated');
