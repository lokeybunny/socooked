-- SMS contact name lookup
CREATE TABLE IF NOT EXISTS public.sms_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_last10 text NOT NULL UNIQUE,
  phone text,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read sms_contacts"
  ON public.sms_contacts FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated insert sms_contacts"
  ON public.sms_contacts FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update sms_contacts"
  ON public.sms_contacts FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated delete sms_contacts"
  ON public.sms_contacts FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER sms_contacts_set_updated_at
  BEFORE UPDATE ON public.sms_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_contacts;