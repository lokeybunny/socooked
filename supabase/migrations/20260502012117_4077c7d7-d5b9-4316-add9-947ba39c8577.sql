
CREATE TABLE public.drop_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_token text NOT NULL UNIQUE,
  campaign_id integer,
  name text NOT NULL,
  audio_url text NOT NULL,
  transfer_number text,
  callback_type integer NOT NULL DEFAULT 1,
  is_default boolean NOT NULL DEFAULT false,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.drop_vm_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_token text NOT NULL,
  phone text NOT NULL,
  customer_id uuid,
  activity_token text,
  status text NOT NULL DEFAULT 'queued',
  api_status_code integer,
  api_status_message text,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_drop_vm_logs_phone ON public.drop_vm_logs (phone);
CREATE INDEX idx_drop_vm_logs_customer ON public.drop_vm_logs (customer_id);
CREATE INDEX idx_drop_vm_logs_created ON public.drop_vm_logs (created_at DESC);

ALTER TABLE public.drop_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drop_vm_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view drop campaigns"
  ON public.drop_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage drop campaigns"
  ON public.drop_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can view drop vm logs"
  ON public.drop_vm_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage drop vm logs"
  ON public.drop_vm_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_drop_campaigns_updated
  BEFORE UPDATE ON public.drop_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
