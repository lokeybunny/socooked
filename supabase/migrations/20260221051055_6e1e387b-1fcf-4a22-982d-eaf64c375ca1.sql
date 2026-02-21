
-- Add source tracking and customer linkage to content_assets
ALTER TABLE public.content_assets
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'dashboard',
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_content_assets_source ON public.content_assets(source);
CREATE INDEX IF NOT EXISTS idx_content_assets_customer_id ON public.content_assets(customer_id);
