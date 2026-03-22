CREATE TABLE public.shill_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id text NOT NULL,
  discord_username text NOT NULL,
  payout_type text NOT NULL DEFAULT 'shill',
  amount numeric NOT NULL DEFAULT 0,
  verified_clicks integer NOT NULL DEFAULT 0,
  solana_wallet text NOT NULL,
  solana_tx_address text,
  paid_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shill_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shill_payouts_all_access" ON public.shill_payouts FOR ALL USING (true) WITH CHECK (true);