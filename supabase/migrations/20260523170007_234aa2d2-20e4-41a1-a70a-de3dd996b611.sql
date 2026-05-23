CREATE TABLE public.studio_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  project_id uuid NULL,
  subproject_id uuid NULL,
  title text NULL,
  content text NOT NULL DEFAULT '',
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_studio_notes_user_sub ON public.studio_notes(user_id, subproject_id, created_at DESC);
CREATE INDEX idx_studio_notes_project ON public.studio_notes(project_id);

ALTER TABLE public.studio_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own studio notes" ON public.studio_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own studio notes" ON public.studio_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own studio notes" ON public.studio_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own studio notes" ON public.studio_notes FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_studio_notes_updated_at
BEFORE UPDATE ON public.studio_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();