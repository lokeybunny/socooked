
CREATE TABLE public.studio_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.studio_projects(id) ON DELETE CASCADE,
  subproject_id UUID REFERENCES public.studio_subprojects(id) ON DELETE SET NULL,
  name TEXT,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_studio_assets_user ON public.studio_assets(user_id);
CREATE INDEX idx_studio_assets_project ON public.studio_assets(project_id);
CREATE INDEX idx_studio_assets_subproject ON public.studio_assets(subproject_id);

ALTER TABLE public.studio_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own studio assets" ON public.studio_assets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own studio assets" ON public.studio_assets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own studio assets" ON public.studio_assets
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own studio assets" ON public.studio_assets
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('studio-assets', 'studio-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read studio-assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'studio-assets');
CREATE POLICY "Users upload to studio-assets" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'studio-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own studio-assets" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'studio-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own studio-assets" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'studio-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
