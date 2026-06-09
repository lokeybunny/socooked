
CREATE TABLE IF NOT EXISTS public.xitbot_admin_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Service role only; no anon/authenticated grants. Edge function uses service role.
GRANT ALL ON public.xitbot_admin_secrets TO service_role;

ALTER TABLE public.xitbot_admin_secrets ENABLE ROW LEVEL SECURITY;

-- No policies → table is inaccessible to anon/authenticated even via PostgREST.
