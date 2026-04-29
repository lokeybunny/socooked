CREATE TABLE IF NOT EXISTS public.sms_deleted_external_ids (
  external_id text PRIMARY KEY,
  phone_last10 text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_deleted_phone_last10 ON public.sms_deleted_external_ids(phone_last10);

ALTER TABLE public.sms_deleted_external_ids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sms deleted ids"
  ON public.sms_deleted_external_ids FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can add sms deleted ids"
  ON public.sms_deleted_external_ids FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can remove sms deleted ids"
  ON public.sms_deleted_external_ids FOR DELETE
  TO authenticated USING (true);