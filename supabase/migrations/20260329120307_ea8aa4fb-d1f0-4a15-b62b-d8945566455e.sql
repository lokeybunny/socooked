
CREATE TABLE public.guru_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  status text NOT NULL DEFAULT 'pending',
  plan text NOT NULL DEFAULT 'pro',
  amount_cents integer NOT NULL DEFAULT 59900,
  square_payment_link_id text,
  square_order_id text,
  square_customer_id text,
  trial_ends_at timestamptz,
  started_at timestamptz,
  cancelled_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guru_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guru_subscriptions_auth_access" ON public.guru_subscriptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "guru_subscriptions_public_insert" ON public.guru_subscriptions
  FOR INSERT TO public WITH CHECK (true);
