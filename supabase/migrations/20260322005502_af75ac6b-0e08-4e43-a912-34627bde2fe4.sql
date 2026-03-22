
CREATE TABLE public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id text NOT NULL,
  discord_username text NOT NULL,
  user_type text NOT NULL DEFAULT 'shiller',
  solana_wallet text NOT NULL,
  amount_owed numeric NOT NULL DEFAULT 0,
  verified_clicks integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  processed_by uuid REFERENCES auth.users(id),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payout_requests_all_access" ON public.payout_requests FOR ALL USING (true) WITH CHECK (true);
