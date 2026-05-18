
CREATE TABLE public.studio_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.studio_projects(id) ON DELETE CASCADE,
  name text,
  image_url text NOT NULL,
  storage_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_studio_references_user ON public.studio_references(user_id);
CREATE INDEX idx_studio_references_project ON public.studio_references(project_id);

ALTER TABLE public.studio_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own refs" ON public.studio_references
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own refs" ON public.studio_references
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own refs" ON public.studio_references
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own refs" ON public.studio_references
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER set_studio_references_updated_at
  BEFORE UPDATE ON public.studio_references
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO storage.buckets (id, name, public)
VALUES ('studio-references', 'studio-references', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read studio refs" ON storage.objects
  FOR SELECT USING (bucket_id = 'studio-references');
CREATE POLICY "Users upload own studio refs" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'studio-references' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own studio refs" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'studio-references' AND auth.uid()::text = (storage.foldername(name))[1]);
