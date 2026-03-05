
-- Vanities table: each row is a unique vanity that can be claimed once
CREATE TABLE public.vanities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text NOT NULL,
  claimed_at timestamptz DEFAULT NULL,
  claimed_ip text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup of unclaimed vanities
CREATE INDEX idx_vanities_unclaimed ON public.vanities (created_at) WHERE claimed_at IS NULL;

-- Index for IP-based rate limiting lookups
CREATE INDEX idx_vanities_claimed_ip ON public.vanities (claimed_ip, claimed_at) WHERE claimed_at IS NOT NULL;

-- Enable RLS
ALTER TABLE public.vanities ENABLE ROW LEVEL SECURITY;

-- Public read-only: nobody can directly read/write from client, only via edge function
-- We'll use service role in the edge function
CREATE POLICY "vanities_no_direct_access" ON public.vanities FOR SELECT USING (false);
