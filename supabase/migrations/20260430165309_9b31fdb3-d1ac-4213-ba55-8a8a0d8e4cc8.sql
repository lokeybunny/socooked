
-- Batches
CREATE TABLE public.listing_image_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  batch_name text NOT NULL DEFAULT 'Untitled Batch',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.listing_image_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own batches select" ON public.listing_image_batches
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own batches insert" ON public.listing_image_batches
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own batches update" ON public.listing_image_batches
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own batches delete" ON public.listing_image_batches
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_lib_updated BEFORE UPDATE ON public.listing_image_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Images
CREATE TABLE public.listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.listing_image_batches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  file_url text NOT NULL,
  storage_path text,
  original_filename text,
  detected_category text,
  confidence numeric,
  ai_description text,
  manual_category text,
  final_category text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.listing_images ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_listing_images_batch ON public.listing_images(batch_id);

CREATE POLICY "own images select" ON public.listing_images
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own images insert" ON public.listing_images
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own images update" ON public.listing_images
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own images delete" ON public.listing_images
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Custom categories
CREATE TABLE public.custom_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, category_name)
);
ALTER TABLE public.custom_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own cats select" ON public.custom_categories
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own cats insert" ON public.custom_categories
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own cats update" ON public.custom_categories
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own cats delete" ON public.custom_categories
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-images', 'listing-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "listing-images public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'listing-images');
CREATE POLICY "listing-images user upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'listing-images' AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "listing-images user update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'listing-images' AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "listing-images user delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'listing-images' AND auth.uid()::text = (storage.foldername(name))[1]
  );
