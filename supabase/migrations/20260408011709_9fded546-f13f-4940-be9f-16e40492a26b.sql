CREATE TABLE public.vapi_remind_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  phone text NOT NULL,
  full_name text NOT NULL,
  business_name text DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 15,
  next_call_at timestamptz NOT NULL,
  last_call_id text,
  last_call_result text,
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vapi_remind_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage remind queue"
  ON public.vapi_remind_queue
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_vapi_remind_queue_updated_at
  BEFORE UPDATE ON public.vapi_remind_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_vapi_remind_queue_status_next ON public.vapi_remind_queue (status, next_call_at)
  WHERE status = 'active';

CREATE INDEX idx_vapi_remind_queue_customer ON public.vapi_remind_queue (customer_id);