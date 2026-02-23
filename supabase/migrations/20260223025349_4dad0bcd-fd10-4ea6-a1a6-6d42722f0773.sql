
-- Create site-assets bucket (public for serving images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-assets', 'site-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view site assets (public bucket)
CREATE POLICY "Site assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'site-assets');

-- Service role / bot can upload (no auth.uid check — edge functions use service role)
CREATE POLICY "Service role can upload site assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'site-assets');

CREATE POLICY "Service role can update site assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'site-assets');

CREATE POLICY "Service role can delete site assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'site-assets');
