
CREATE TABLE IF NOT EXISTS public.auto_reply_kill_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  phone text,
  reason text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_reply_kill_log_created_at
  ON public.auto_reply_kill_log (created_at DESC);

ALTER TABLE public.auto_reply_kill_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read auto_reply_kill_log"
  ON public.auto_reply_kill_log FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert auto_reply_kill_log"
  ON public.auto_reply_kill_log FOR INSERT
  TO authenticated WITH CHECK (true);
