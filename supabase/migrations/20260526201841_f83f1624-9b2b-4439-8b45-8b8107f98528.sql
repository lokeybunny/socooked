
-- 1) When a new outbound SMS/iMessage communication is created, flag matching hot replies as leads
CREATE OR REPLACE FUNCTION public.auto_flag_hot_reply_lead_on_outbound_comm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _last10 text;
BEGIN
  IF NEW.direction = 'outbound'
     AND NEW.type IN ('sms', 'imessage')
     AND COALESCE(NEW.status, 'sent') NOT IN ('draft', 'failed') THEN
    _last10 := right(regexp_replace(COALESCE(NEW.phone_number, NEW.to_address, ''), '\D', '', 'g'), 10);
    IF length(_last10) = 10 THEN
      UPDATE public.hot_reply_imports
         SET is_lead = true,
             marked_lead_at = COALESCE(marked_lead_at, now()),
             updated_at = now()
       WHERE is_lead = false
         AND right(regexp_replace(COALESCE(phone,''), '\D', '', 'g'), 10) = _last10;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_flag_hot_reply_lead_on_outbound_comm ON public.communications;
CREATE TRIGGER trg_auto_flag_hot_reply_lead_on_outbound_comm
AFTER INSERT ON public.communications
FOR EACH ROW
EXECUTE FUNCTION public.auto_flag_hot_reply_lead_on_outbound_comm();

-- 2) Extend the on-insert hot-reply trigger to also check 72h outbound history
CREATE OR REPLACE FUNCTION public.auto_flag_hot_reply_lead_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _last10 text;
BEGIN
  _last10 := right(regexp_replace(COALESCE(NEW.phone,''), '\D', '', 'g'), 10);
  IF length(_last10) = 10 AND NEW.is_lead = false THEN
    -- pinned contact rule
    IF EXISTS (SELECT 1 FROM public.sms_contacts WHERE phone_last10 = _last10 AND pinned = true) THEN
      NEW.is_lead := true;
      NEW.marked_lead_at := COALESCE(NEW.marked_lead_at, now());
    -- outbound SMS/iMessage sent within last 72 hours
    ELSIF EXISTS (
      SELECT 1 FROM public.communications c
       WHERE c.direction = 'outbound'
         AND c.type IN ('sms','imessage')
         AND COALESCE(c.status,'sent') NOT IN ('draft','failed')
         AND c.created_at >= now() - interval '72 hours'
         AND right(regexp_replace(COALESCE(c.phone_number, c.to_address, ''), '\D', '', 'g'), 10) = _last10
    ) THEN
      NEW.is_lead := true;
      NEW.marked_lead_at := COALESCE(NEW.marked_lead_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Backfill existing hot replies whose phone received an outbound SMS/iMessage in the last 72h
UPDATE public.hot_reply_imports hr
   SET is_lead = true,
       marked_lead_at = COALESCE(hr.marked_lead_at, now()),
       updated_at = now()
 WHERE hr.is_lead = false
   AND EXISTS (
     SELECT 1 FROM public.communications c
      WHERE c.direction = 'outbound'
        AND c.type IN ('sms','imessage')
        AND COALESCE(c.status,'sent') NOT IN ('draft','failed')
        AND c.created_at >= now() - interval '72 hours'
        AND right(regexp_replace(COALESCE(c.phone_number, c.to_address, ''), '\D', '', 'g'), 10)
            = right(regexp_replace(COALESCE(hr.phone,''), '\D', '', 'g'), 10)
   );
