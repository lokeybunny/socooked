
CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id text,
  address text,
  price numeric,
  beds numeric,
  baths numeric,
  sqft numeric,
  zillow_url text NOT NULL,
  thumbnail_url text,
  status text NOT NULL DEFAULT 'pending',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (zillow_url)
);

CREATE INDEX IF NOT EXISTS idx_properties_created_at ON public.properties (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_listing_id ON public.properties (listing_id);

CREATE TABLE IF NOT EXISTS public.property_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  storage_path text,
  room_type text,
  ai_tag text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_images_property ON public.property_images (property_id, position);
CREATE INDEX IF NOT EXISTS idx_property_images_room_type ON public.property_images (room_type);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read properties"  ON public.properties FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write properties" ON public.properties FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update properties" ON public.properties FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete properties" ON public.properties FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth read property_images"  ON public.property_images FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write property_images" ON public.property_images FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update property_images" ON public.property_images FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete property_images" ON public.property_images FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
