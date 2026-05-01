ALTER TABLE public.sms_contacts
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS tags text[];

-- Ensure authenticated can upsert/update notes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sms_contacts' AND policyname='sms_contacts_auth_all'
  ) THEN
    CREATE POLICY sms_contacts_auth_all ON public.sms_contacts
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;