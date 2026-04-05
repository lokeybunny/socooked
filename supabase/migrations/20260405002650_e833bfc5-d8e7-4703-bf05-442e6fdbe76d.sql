CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.arbitrage_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_name TEXT NOT NULL DEFAULT 'Untitled Item',
  original_image_url TEXT,
  nobg_image_url TEXT,
  pawn_shop_address TEXT,
  asking_price NUMERIC,
  wiggle_room_price NUMERIC,
  condition_notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.arbitrage_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arbitrage_items_auth_access"
  ON public.arbitrage_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_arbitrage_items_updated_at
  BEFORE UPDATE ON public.arbitrage_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();