
CREATE TABLE public.meta_ad_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  duration_seconds INTEGER,
  thumbnail_url TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_ad_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ad videos"
  ON public.meta_ad_videos FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their own ad videos"
  ON public.meta_ad_videos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own ad videos"
  ON public.meta_ad_videos FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own ad videos"
  ON public.meta_ad_videos FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE TRIGGER set_meta_ad_videos_updated_at
  BEFORE UPDATE ON public.meta_ad_videos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
