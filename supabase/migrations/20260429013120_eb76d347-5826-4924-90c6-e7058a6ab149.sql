CREATE TABLE public.payme_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE,
  auth_code TEXT,
  amount NUMERIC(10,2) NOT NULL,
  last4 TEXT,
  payer_name TEXT,
  payer_email TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payme_charges ENABLE ROW LEVEL SECURITY;

-- Public read of safe receipt fields (no card data is stored)
CREATE POLICY "Anyone can view payme receipts"
  ON public.payme_charges
  FOR SELECT
  USING (true);

-- Inserts only via service role (edge function)
CREATE INDEX idx_payme_charges_created_at ON public.payme_charges (created_at DESC);