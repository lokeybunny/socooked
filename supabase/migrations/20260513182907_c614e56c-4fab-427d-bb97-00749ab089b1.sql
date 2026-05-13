-- Stop auto-flipping hot_reply_imports to "called" when sms_contacts is touched
-- (warm-welcome sends were upserting sms_contacts and tripping this).
-- The inbound + powerdial triggers still flip on real replies / real calls.
DROP TRIGGER IF EXISTS mark_hot_reply_called_on_sms_contact_trg ON public.sms_contacts;
DROP TRIGGER IF EXISTS trg_mark_hot_reply_called_on_sms_contact ON public.sms_contacts;
DROP TRIGGER IF EXISTS mark_hot_reply_called_on_sms_contact ON public.sms_contacts;

-- Neutralize the function so any other attached trigger name is also a no-op.
CREATE OR REPLACE FUNCTION public.mark_hot_reply_called_on_sms_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Disabled: warm-welcome sends were incorrectly flipping hot replies to "called".
  -- Hot replies should only flip when a real inbound reply lands or a real call is placed.
  RETURN NEW;
END;
$function$;