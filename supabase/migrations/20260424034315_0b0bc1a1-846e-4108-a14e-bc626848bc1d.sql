-- ============================================
-- PolyVibe InnerEdge schema
-- ============================================

-- 1. poly_users: links Lovable Cloud auth user to Discord identity
CREATE TABLE public.poly_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_id TEXT UNIQUE,
  discord_username TEXT,
  discord_avatar_url TEXT,
  email TEXT,
  referral_code TEXT UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poly_users_discord_id ON public.poly_users(discord_id);
CREATE INDEX idx_poly_users_user_id ON public.poly_users(user_id);

-- 2. poly_payments: every NowPayments invoice
CREATE TABLE public.poly_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  poly_user_id UUID REFERENCES public.poly_users(id) ON DELETE SET NULL,
  discord_id TEXT,
  order_id TEXT UNIQUE NOT NULL,
  nowpayments_invoice_id TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('monthly','yearly')),
  amount_sol NUMERIC(20,9) NOT NULL,
  amount_usd NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','waiting','confirming','confirmed','sending','partially_paid','finished','failed','refunded','expired')),
  pay_address TEXT,
  invoice_url TEXT,
  qr_code_url TEXT,
  expires_at TIMESTAMPTZ,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poly_payments_user_id ON public.poly_payments(user_id);
CREATE INDEX idx_poly_payments_status ON public.poly_payments(status);
CREATE INDEX idx_poly_payments_discord_id ON public.poly_payments(discord_id);

-- 3. poly_memberships: who has access right now
CREATE TABLE public.poly_memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  poly_user_id UUID UNIQUE REFERENCES public.poly_users(id) ON DELETE CASCADE,
  discord_id TEXT,
  role TEXT NOT NULL DEFAULT 'inner_edge_member',
  tier TEXT CHECK (tier IN ('monthly','yearly')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_payment_id UUID REFERENCES public.poly_payments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poly_memberships_expires_at ON public.poly_memberships(expires_at);
CREATE INDEX idx_poly_memberships_discord_id ON public.poly_memberships(discord_id);

-- 4. poly_signals: AI-generated edges
CREATE TABLE public.poly_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  market_slug TEXT,
  market_question TEXT,
  market_url TEXT,
  edge_score NUMERIC(5,2),
  market_probability NUMERIC(5,2),
  edge_probability NUMERIC(5,2),
  probability_mismatch NUMERIC(5,2),
  confidence TEXT CHECK (confidence IN ('low','medium','high','degen')),
  risk_level TEXT CHECK (risk_level IN ('low','medium','high','degen')),
  suggested_size TEXT,
  recommendation TEXT,
  vibe TEXT,
  outcome TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poly_signals_created_at ON public.poly_signals(created_at DESC);
CREATE INDEX idx_poly_signals_published ON public.poly_signals(is_published, created_at DESC);

-- 5. poly_market_cache: Polymarket Gamma API cache
CREATE TABLE public.poly_market_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  slug TEXT,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poly_market_cache_key ON public.poly_market_cache(cache_key);
CREATE INDEX idx_poly_market_cache_expires ON public.poly_market_cache(expires_at);

-- 6. poly_referrals
CREATE TABLE public.poly_referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.poly_payments(id) ON DELETE SET NULL,
  reward_sol NUMERIC(20,9),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','credited','paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poly_referrals_referrer ON public.poly_referrals(referrer_user_id);

-- 7. poly_admins: admin allowlist
CREATE TABLE public.poly_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Helper functions (SECURITY DEFINER, no recursion)
-- ============================================

CREATE OR REPLACE FUNCTION public.poly_is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.poly_admins WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.poly_is_member(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.poly_memberships
    WHERE user_id = _user_id
      AND expires_at > now()
  )
$$;

-- updated_at trigger reuse
CREATE TRIGGER trg_poly_users_updated BEFORE UPDATE ON public.poly_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_poly_payments_updated BEFORE UPDATE ON public.poly_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_poly_memberships_updated BEFORE UPDATE ON public.poly_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_poly_signals_updated BEFORE UPDATE ON public.poly_signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE public.poly_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poly_payments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poly_memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poly_signals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poly_market_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poly_referrals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poly_admins       ENABLE ROW LEVEL SECURITY;

-- poly_users: each user reads/edits their own row; admins see all
CREATE POLICY "poly_users self select" ON public.poly_users
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.poly_is_admin(auth.uid()));
CREATE POLICY "poly_users self insert" ON public.poly_users
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "poly_users self update" ON public.poly_users
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.poly_is_admin(auth.uid()));

-- poly_payments: user sees own; admins see all
CREATE POLICY "poly_payments self select" ON public.poly_payments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.poly_is_admin(auth.uid()));

-- poly_memberships: user sees own; admins see all
CREATE POLICY "poly_memberships self select" ON public.poly_memberships
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.poly_is_admin(auth.uid()));

-- poly_signals: any authenticated member or admin can read published; admins write
CREATE POLICY "poly_signals members read" ON public.poly_signals
  FOR SELECT TO authenticated
  USING (
    is_published = true AND (
      public.poly_is_member(auth.uid()) OR public.poly_is_admin(auth.uid())
    )
  );
CREATE POLICY "poly_signals admin write" ON public.poly_signals
  FOR ALL TO authenticated
  USING (public.poly_is_admin(auth.uid()))
  WITH CHECK (public.poly_is_admin(auth.uid()));

-- poly_market_cache: anyone authenticated can read (it's public market data)
CREATE POLICY "poly_market_cache read" ON public.poly_market_cache
  FOR SELECT TO authenticated USING (true);

-- poly_referrals: user sees own as referrer or referred; admins all
CREATE POLICY "poly_referrals self select" ON public.poly_referrals
  FOR SELECT TO authenticated
  USING (
    auth.uid() = referrer_user_id
    OR auth.uid() = referred_user_id
    OR public.poly_is_admin(auth.uid())
  );

-- poly_admins: only admins read; no client writes
CREATE POLICY "poly_admins admin read" ON public.poly_admins
  FOR SELECT TO authenticated
  USING (public.poly_is_admin(auth.uid()));