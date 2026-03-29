ALTER TABLE public.lw_landing_pages
  ADD COLUMN IF NOT EXISTS vapi_credit_balance_cents integer NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS vapi_total_spent_cents integer NOT NULL DEFAULT 0;