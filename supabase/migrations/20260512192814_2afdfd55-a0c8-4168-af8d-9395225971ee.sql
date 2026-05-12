-- Inbound Twilio SMS/calls → mark hot reply as called
CREATE OR REPLACE FUNCTION public.mark_hot_reply_called_on_inbound()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _last10 text;
BEGIN
  _last10 := right(regexp_replace(COALESCE(NEW.from_number, ''), '\D', '', 'g'), 10);
  IF length(_last10) = 10 THEN
    UPDATE public.hot_reply_imports
       SET call_status = 'called', updated_at = now()
     WHERE call_status = 'not_called'
       AND right(regexp_replace(phone, '\D', '', 'g'), 10) = _last10;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_hot_reply_inbound ON public.twilio_inbound_logs;
CREATE TRIGGER trg_mark_hot_reply_inbound
  AFTER INSERT ON public.twilio_inbound_logs
  FOR EACH ROW EXECUTE FUNCTION public.mark_hot_reply_called_on_inbound();

-- Any contact added to sms_contacts (= ever texted) → mark called
CREATE OR REPLACE FUNCTION public.mark_hot_reply_called_on_sms_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.phone_last10 IS NOT NULL AND length(NEW.phone_last10) = 10 THEN
    UPDATE public.hot_reply_imports
       SET call_status = 'called', updated_at = now()
     WHERE call_status = 'not_called'
       AND right(regexp_replace(phone, '\D', '', 'g'), 10) = NEW.phone_last10;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_hot_reply_sms_contact ON public.sms_contacts;
CREATE TRIGGER trg_mark_hot_reply_sms_contact
  AFTER INSERT ON public.sms_contacts
  FOR EACH ROW EXECUTE FUNCTION public.mark_hot_reply_called_on_sms_contact();