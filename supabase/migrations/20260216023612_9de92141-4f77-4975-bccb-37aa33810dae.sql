
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _action text;
  _entity_id uuid;
  _meta jsonb;
  _name text;
  _row jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _action := 'deleted';
    _row := to_jsonb(OLD);
    _entity_id := OLD.id;
  ELSE
    IF TG_OP = 'INSERT' THEN _action := 'created'; ELSE _action := 'updated'; END IF;
    _row := to_jsonb(NEW);
    _entity_id := NEW.id;
  END IF;

  _name := coalesce(
    _row->>'title',
    _row->>'name',
    _row->>'full_name',
    _row->>'subject',
    ''
  );

  _meta := jsonb_build_object('name', _name);

  INSERT INTO public.activity_log (entity_type, entity_id, action, actor_id, meta)
  VALUES (TG_ARGV[0], _entity_id, _action, auth.uid(), _meta);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
