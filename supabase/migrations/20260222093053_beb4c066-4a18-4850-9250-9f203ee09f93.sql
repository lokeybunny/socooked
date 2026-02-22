
-- Table to store all API-generated preview assets (v0.dev, Higgsfield, etc.)
CREATE TABLE public.api_previews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'v0-designer',  -- 'v0-designer', 'higgsfield', etc.
  title TEXT NOT NULL,
  prompt TEXT,
  preview_url TEXT,
  edit_url TEXT,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'completed',  -- 'pending', 'in_progress', 'completed', 'failed'
  meta JSONB NOT NULL DEFAULT '{}',
  bot_task_id UUID REFERENCES public.bot_tasks(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES public.conversation_threads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_previews ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can read all previews
CREATE POLICY "Authenticated users can view previews"
ON public.api_previews FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can insert
CREATE POLICY "Authenticated users can insert previews"
ON public.api_previews FOR INSERT
TO authenticated
WITH CHECK (true);

-- Authenticated users can update
CREATE POLICY "Authenticated users can update previews"
ON public.api_previews FOR UPDATE
TO authenticated
USING (true);

-- Authenticated users can delete
CREATE POLICY "Authenticated users can delete previews"
ON public.api_previews FOR DELETE
TO authenticated
USING (true);

-- Service role bypass for edge functions (implicit via service key)

-- Allow edge functions using service role to insert without auth
CREATE POLICY "Service role full access"
ON public.api_previews FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER set_api_previews_updated_at
BEFORE UPDATE ON public.api_previews
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Index for fast customer lookups
CREATE INDEX idx_api_previews_customer ON public.api_previews(customer_id);
CREATE INDEX idx_api_previews_source ON public.api_previews(source);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.api_previews;
