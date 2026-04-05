
ALTER TABLE public.arbitrage_items 
ADD COLUMN IF NOT EXISTS extra_images text[] DEFAULT '{}';
