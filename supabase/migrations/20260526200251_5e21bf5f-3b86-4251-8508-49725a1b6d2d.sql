
ALTER TABLE public.hot_reply_imports
  ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marked_lead_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_hri_is_lead ON public.hot_reply_imports(is_lead) WHERE is_lead = true;

-- Backfill: any hot reply whose phone matches a pinned sms_contact becomes a lead
UPDATE public.hot_reply_imports h
SET is_lead = true, marked_lead_at = COALESCE(h.marked_lead_at, now())
FROM public.sms_contacts c
WHERE c.pinned = true
  AND right(regexp_replace(COALESCE(h.phone,''), '\D', '', 'g'), 10) = c.phone_last10
  AND h.is_lead = false;

-- When an sms_contact gets pinned, auto-flag any matching hot replies as leads
CREATE OR REPLACE FUNCTION public.auto_flag_hot_reply_lead_on_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.pinned = true AND (TG_OP = 'INSERT' OR OLD.pinned IS DISTINCT FROM true) THEN
    UPDATE public.hot_reply_imports
       SET is_lead = true,
           marked_lead_at = COALESCE(marked_lead_at, now()),
           updated_at = now()
     WHERE is_lead = false
       AND right(regexp_replace(COALESCE(phone,''), '\D', '', 'g'), 10) = NEW.phone_last10;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_flag_hot_reply_lead_on_pin ON public.sms_contacts;
CREATE TRIGGER trg_auto_flag_hot_reply_lead_on_pin
AFTER INSERT OR UPDATE OF pinned ON public.sms_contacts
FOR EACH ROW EXECUTE FUNCTION public.auto_flag_hot_reply_lead_on_pin();

-- When a hot reply is imported, check if it matches a pinned sms_contact
CREATE OR REPLACE FUNCTION public.auto_flag_hot_reply_lead_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _last10 text;
BEGIN
  _last10 := right(regexp_replace(COALESCE(NEW.phone,''), '\D', '', 'g'), 10);
  IF length(_last10) = 10 AND NEW.is_lead = false THEN
    IF EXISTS (SELECT 1 FROM public.sms_contacts WHERE phone_last10 = _last10 AND pinned = true) THEN
      NEW.is_lead := true;
      NEW.marked_lead_at := COALESCE(NEW.marked_lead_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_flag_hot_reply_lead_on_insert ON public.hot_reply_imports;
CREATE TRIGGER trg_auto_flag_hot_reply_lead_on_insert
BEFORE INSERT ON public.hot_reply_imports
FOR EACH ROW EXECUTE FUNCTION public.auto_flag_hot_reply_lead_on_insert();
