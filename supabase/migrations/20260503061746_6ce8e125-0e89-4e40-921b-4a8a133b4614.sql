CREATE OR REPLACE FUNCTION public.track_proposal_deposit_open(_proposal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _now text := to_jsonb(now()) #>> '{}';
  _current_meta jsonb;
  _opens integer;
BEGIN
  SELECT COALESCE(meta, '{}'::jsonb) INTO _current_meta
  FROM public.proposals
  WHERE id = _proposal_id
  FOR UPDATE;

  IF _current_meta IS NULL THEN
    RETURN;
  END IF;

  _opens := COALESCE((_current_meta ->> 'deposit_email_opens')::integer, 0) + 1;

  UPDATE public.proposals
  SET meta = _current_meta || jsonb_build_object(
    'deposit_email_opened_at', COALESCE(_current_meta ->> 'deposit_email_opened_at', _now),
    'deposit_email_last_opened_at', _now,
    'deposit_email_opens', _opens
  ),
  updated_at = now()
  WHERE id = _proposal_id;
END;
$function$;