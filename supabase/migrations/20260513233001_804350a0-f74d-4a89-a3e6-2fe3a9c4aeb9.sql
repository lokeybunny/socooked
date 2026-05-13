CREATE OR REPLACE FUNCTION public.mark_hot_reply_contacted_on_communication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _last10 text;
BEGIN
  IF NEW.direction = 'outbound'
     AND NEW.type IN ('sms', 'call')
     AND COALESCE(NEW.status, 'sent') NOT IN ('draft', 'failed') THEN
    _last10 := right(regexp_replace(COALESCE(NEW.phone_number, NEW.to_address, ''), '\D', '', 'g'), 10);

    IF length(_last10) = 10 THEN
      UPDATE public.hot_reply_imports
         SET call_status = 'called', updated_at = now()
       WHERE call_status = 'not_called'
         AND right(regexp_replace(phone, '\D', '', 'g'), 10) = _last10;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_hot_reply_contacted_on_communication ON public.communications;
CREATE TRIGGER trg_mark_hot_reply_contacted_on_communication
  AFTER INSERT OR UPDATE OF type, direction, status, phone_number, to_address
  ON public.communications
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_hot_reply_contacted_on_communication();

WITH contacted AS (
  SELECT DISTINCT right(regexp_replace(COALESCE(phone_number, to_address, ''), '\D', '', 'g'), 10) AS last10
  FROM public.communications
  WHERE direction = 'outbound'
    AND type IN ('sms', 'call')
    AND COALESCE(status, 'sent') NOT IN ('draft', 'failed')
    AND length(right(regexp_replace(COALESCE(phone_number, to_address, ''), '\D', '', 'g'), 10)) = 10
)
UPDATE public.hot_reply_imports h
   SET call_status = 'called', updated_at = now()
  FROM contacted c
 WHERE h.call_status = 'not_called'
   AND right(regexp_replace(h.phone, '\D', '', 'g'), 10) = c.last10;