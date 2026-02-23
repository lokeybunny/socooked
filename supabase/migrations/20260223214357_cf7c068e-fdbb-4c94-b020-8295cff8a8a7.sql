
-- Add share_token to content_assets for private share links
ALTER TABLE public.content_assets ADD COLUMN IF NOT EXISTS share_token text UNIQUE DEFAULT NULL;

-- Create index for fast share token lookups
CREATE INDEX IF NOT EXISTS idx_content_assets_share_token ON public.content_assets (share_token) WHERE share_token IS NOT NULL;
