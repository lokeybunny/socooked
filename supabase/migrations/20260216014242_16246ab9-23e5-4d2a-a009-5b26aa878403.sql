
-- Bot tasks table for AI agent task queues
CREATE TABLE public.bot_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_agent TEXT NOT NULL CHECK (bot_agent IN ('receptionist', 'web_dev', 'social_media')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'in_progress', 'done', 'failed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date TIMESTAMPTZ,
  customer_id UUID REFERENCES public.customers(id),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bot_tasks ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "bot_tasks_all_access" ON public.bot_tasks FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_bot_tasks_agent ON public.bot_tasks (bot_agent);
CREATE INDEX idx_bot_tasks_status ON public.bot_tasks (status);
CREATE INDEX idx_bot_tasks_due_date ON public.bot_tasks (due_date);

-- Auto-update timestamp
CREATE TRIGGER update_bot_tasks_updated_at
  BEFORE UPDATE ON public.bot_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
