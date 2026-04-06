-- Add store_number column
ALTER TABLE public.arbitrage_stores
  ADD COLUMN store_number integer;

-- Backfill existing stores in order of creation
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.arbitrage_stores
)
UPDATE public.arbitrage_stores s
SET store_number = n.rn
FROM numbered n
WHERE s.id = n.id;

-- Make it not null and unique now that it's backfilled
ALTER TABLE public.arbitrage_stores
  ALTER COLUMN store_number SET NOT NULL;

ALTER TABLE public.arbitrage_stores
  ADD CONSTRAINT arbitrage_stores_store_number_unique UNIQUE (store_number);

-- Create a sequence starting after the current max
DO $$
DECLARE
  _max int;
BEGIN
  SELECT COALESCE(MAX(store_number), 0) INTO _max FROM public.arbitrage_stores;
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS arbitrage_stores_number_seq START WITH %s', _max + 1);
  EXECUTE format('ALTER TABLE public.arbitrage_stores ALTER COLUMN store_number SET DEFAULT nextval(''arbitrage_stores_number_seq'')');
END;
$$;