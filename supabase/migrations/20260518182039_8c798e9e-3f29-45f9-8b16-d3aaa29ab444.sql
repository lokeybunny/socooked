
CREATE TABLE public.studio_subprojects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  cover_url text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_studio_subprojects_project ON public.studio_subprojects(project_id);
CREATE INDEX idx_studio_subprojects_user ON public.studio_subprojects(user_id);

ALTER TABLE public.studio_subprojects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subprojects" ON public.studio_subprojects
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own subprojects" ON public.studio_subprojects
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own subprojects" ON public.studio_subprojects
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own subprojects" ON public.studio_subprojects
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER set_studio_subprojects_updated_at
  BEFORE UPDATE ON public.studio_subprojects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS subproject_id uuid REFERENCES public.studio_subprojects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_generation_jobs_subproject ON public.generation_jobs(subproject_id);
