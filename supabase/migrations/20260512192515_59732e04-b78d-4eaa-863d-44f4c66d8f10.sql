CREATE OR REPLACE FUNCTION public.mark_hot_reply_called_on_powerdial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _last10 text;
BEGIN
  _last10 := right(regexp_replace(COALESCE(NEW.phone, NEW.to_number, ''), '\D', '', 'g'), 10);
  IF length(_last10) = 10 THEN
    UPDATE public.hot_reply_imports
       SET call_status = 'called', updated_at = now()
     WHERE call_status = 'not_called'
       AND right(regexp_replace(phone, '\D', '', 'g'), 10) = _last10;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_hot_reply_called ON public.powerdial_call_logs;
CREATE TRIGGER trg_mark_hot_reply_called
  AFTER INSERT ON public.powerdial_call_logs
  FOR EACH ROW EXECUTE FUNCTION public.mark_hot_reply_called_on_powerdial();