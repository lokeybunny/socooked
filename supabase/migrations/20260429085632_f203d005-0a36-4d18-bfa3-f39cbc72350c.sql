
ALTER TABLE public.sms_contacts
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS starred_at timestamptz;

CREATE OR REPLACE FUNCTION public.star_sms_contact_on_proposal_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _last10 text;
BEGIN
  IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed') THEN
    _last10 := regexp_replace(COALESCE(NEW.client_phone, ''), '\D', '', 'g');
    _last10 := right(_last10, 10);
    IF length(_last10) = 10 THEN
      INSERT INTO public.sms_contacts (phone_last10, phone, name, email, starred, starred_at)
      VALUES (
        _last10,
        COALESCE(NEW.client_phone, '+1' || _last10),
        NEW.client_name,
        NEW.client_email,
        true,
        now()
      )
      ON CONFLICT (phone_last10) DO UPDATE
        SET starred = true,
            starred_at = COALESCE(public.sms_contacts.starred_at, now()),
            email = COALESCE(EXCLUDED.email, public.sms_contacts.email),
            name = COALESCE(public.sms_contacts.name, EXCLUDED.name),
            updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_star_sms_contact_on_proposal_signed ON public.proposals;
CREATE TRIGGER trg_star_sms_contact_on_proposal_signed
AFTER UPDATE OF status ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.star_sms_contact_on_proposal_signed();
