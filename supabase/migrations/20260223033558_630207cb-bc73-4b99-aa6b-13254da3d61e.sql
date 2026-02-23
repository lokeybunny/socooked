
-- Create a public storage bucket for content uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('content-uploads', 'content-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read files (public bucket)
CREATE POLICY "Public read content-uploads"
ON storage.objects FOR SELECT
USING (bucket_id = 'content-uploads');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated upload content-uploads"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'content-uploads');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated delete content-uploads"
ON storage.objects FOR DELETE
USING (bucket_id = 'content-uploads');
