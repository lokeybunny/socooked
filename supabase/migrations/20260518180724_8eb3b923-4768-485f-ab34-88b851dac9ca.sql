
CREATE TABLE IF NOT EXISTS public.studio_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  kind TEXT,
  description TEXT,
  cover_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners select studio_projects" ON public.studio_projects
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owners insert studio_projects" ON public.studio_projects
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owners update studio_projects" ON public.studio_projects
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owners delete studio_projects" ON public.studio_projects
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.studio_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_project_id ON public.generation_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_studio_projects_user_id ON public.studio_projects(user_id);
