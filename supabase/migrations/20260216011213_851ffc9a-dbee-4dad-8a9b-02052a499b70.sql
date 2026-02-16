
-- Communications log for calls, SMS, emails
CREATE TABLE public.communications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id),
  customer_id UUID REFERENCES public.customers(id),
  type TEXT NOT NULL CHECK (type IN ('email', 'sms', 'call')),
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'received', 'failed', 'read')),
  from_address TEXT,
  to_address TEXT,
  phone_number TEXT,
  duration_seconds INTEGER,
  provider TEXT,
  external_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "communications_all_access" ON public.communications FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER set_communications_updated_at
  BEFORE UPDATE ON public.communications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_communications_type ON public.communications(type);
CREATE INDEX idx_communications_user_id ON public.communications(user_id);
CREATE INDEX idx_communications_customer_id ON public.communications(customer_id);
CREATE INDEX idx_communications_created_at ON public.communications(created_at DESC);
