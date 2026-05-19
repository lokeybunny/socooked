ALTER TABLE public.studio_assets
  ADD COLUMN IF NOT EXISTS pair_id uuid,
  ADD COLUMN IF NOT EXISTS variant text;

CREATE INDEX IF NOT EXISTS idx_studio_assets_pair ON public.studio_assets(pair_id);