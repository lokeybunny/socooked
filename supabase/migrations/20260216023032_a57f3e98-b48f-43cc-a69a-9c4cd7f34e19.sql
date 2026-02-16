
-- Generic function to log activity from any table trigger
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
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'created';
    _entity_id := NEW.id;
    _name := coalesce(NEW.title, NEW.name, NEW.full_name, '');
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'updated';
    _entity_id := NEW.id;
    _name := coalesce(NEW.title, NEW.name, NEW.full_name, '');
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'deleted';
    _entity_id := OLD.id;
    _name := coalesce(OLD.title, OLD.name, OLD.full_name, '');
  END IF;

  _meta := jsonb_build_object('name', _name);

  INSERT INTO public.activity_log (entity_type, entity_id, action, actor_id, meta)
  VALUES (TG_ARGV[0], _entity_id, _action, auth.uid(), _meta);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Customers
CREATE TRIGGER trg_activity_customers
AFTER INSERT OR UPDATE OR DELETE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.log_activity('customer');

-- Deals
CREATE TRIGGER trg_activity_deals
AFTER INSERT OR UPDATE OR DELETE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.log_activity('deal');

-- Projects
CREATE TRIGGER trg_activity_projects
AFTER INSERT OR UPDATE OR DELETE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.log_activity('project');

-- Tasks
CREATE TRIGGER trg_activity_tasks
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_activity('task');

-- Boards
CREATE TRIGGER trg_activity_boards
AFTER INSERT OR UPDATE OR DELETE ON public.boards
FOR EACH ROW EXECUTE FUNCTION public.log_activity('board');

-- Cards
CREATE TRIGGER trg_activity_cards
AFTER INSERT OR UPDATE OR DELETE ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.log_activity('card');

-- Invoices
CREATE TRIGGER trg_activity_invoices
AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.log_activity('invoice');

-- Documents
CREATE TRIGGER trg_activity_documents
AFTER INSERT OR UPDATE OR DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.log_activity('document');

-- Signatures
CREATE TRIGGER trg_activity_signatures
AFTER INSERT OR UPDATE OR DELETE ON public.signatures
FOR EACH ROW EXECUTE FUNCTION public.log_activity('signature');

-- Threads
CREATE TRIGGER trg_activity_threads
AFTER INSERT OR UPDATE OR DELETE ON public.conversation_threads
FOR EACH ROW EXECUTE FUNCTION public.log_activity('thread');

-- Content
CREATE TRIGGER trg_activity_content
AFTER INSERT OR UPDATE OR DELETE ON public.content_assets
FOR EACH ROW EXECUTE FUNCTION public.log_activity('content');

-- Communications
CREATE TRIGGER trg_activity_communications
AFTER INSERT OR UPDATE OR DELETE ON public.communications
FOR EACH ROW EXECUTE FUNCTION public.log_activity('communication');

-- Lists
CREATE TRIGGER trg_activity_lists
AFTER INSERT OR UPDATE OR DELETE ON public.lists
FOR EACH ROW EXECUTE FUNCTION public.log_activity('list');

-- Enable realtime on activity_log
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
