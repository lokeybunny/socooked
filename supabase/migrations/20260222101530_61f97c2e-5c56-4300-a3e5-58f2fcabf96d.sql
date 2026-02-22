
-- 1. Cascade delete previews when customer is deleted
ALTER TABLE public.api_previews
  DROP CONSTRAINT IF EXISTS api_previews_customer_id_fkey,
  ADD CONSTRAINT api_previews_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

-- 2. Auto-delete previews when a project is finalized (completed/done)
CREATE OR REPLACE FUNCTION public.cleanup_previews_on_project_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IN ('completed', 'done') AND OLD.status NOT IN ('completed', 'done') THEN
    DELETE FROM public.api_previews WHERE customer_id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_previews_on_project_complete
  AFTER UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_previews_on_project_complete();
