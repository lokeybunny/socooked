
CREATE TABLE public.signature_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle text NOT NULL,
  used_at timestamp with time zone NOT NULL DEFAULT now(),
  post_id uuid REFERENCES public.shill_scheduled_posts(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_signature_usage_handle ON public.signature_usage(handle);
CREATE INDEX idx_signature_usage_used_at ON public.signature_usage(used_at DESC);

ALTER TABLE public.signature_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signature_usage_all_access" ON public.signature_usage
  FOR ALL USING (true) WITH CHECK (true);
