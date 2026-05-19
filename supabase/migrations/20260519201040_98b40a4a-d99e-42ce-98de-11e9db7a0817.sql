
-- Batches table
CREATE TABLE public.studio_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.studio_projects(id) ON DELETE SET NULL,
  subproject_id uuid REFERENCES public.studio_subprojects(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT 'Untitled Batch',
  status text NOT NULL DEFAULT 'draft',
  total_items integer NOT NULL DEFAULT 0,
  completed_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_studio_batches_user ON public.studio_batches(user_id);
CREATE INDEX idx_studio_batches_scope ON public.studio_batches(user_id, project_id, subproject_id, status);

ALTER TABLE public.studio_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own batches" ON public.studio_batches
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_studio_batches_updated
  BEFORE UPDATE ON public.studio_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Batch items
CREATE TABLE public.studio_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.studio_batches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_type text NOT NULL,
  prompt text NOT NULL,
  negative_prompt text,
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_image_url text,
  input_audio_url text,
  position integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  generation_job_id uuid REFERENCES public.generation_jobs(id) ON DELETE SET NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_batch_items_batch ON public.studio_batch_items(batch_id, position);
CREATE INDEX idx_batch_items_user ON public.studio_batch_items(user_id);

ALTER TABLE public.studio_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own batch items" ON public.studio_batch_items
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_studio_batch_items_updated
  BEFORE UPDATE ON public.studio_batch_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add batch_id to generation_jobs for library grouping
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.studio_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_generation_jobs_batch ON public.generation_jobs(batch_id);
