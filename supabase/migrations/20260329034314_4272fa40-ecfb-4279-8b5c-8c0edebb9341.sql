
ALTER TABLE public.lw_sellers
  ADD COLUMN IF NOT EXISTS bedrooms integer,
  ADD COLUMN IF NOT EXISTS bathrooms numeric,
  ADD COLUMN IF NOT EXISTS living_sqft integer;

-- Backfill from existing meta JSONB
UPDATE public.lw_sellers
SET
  bedrooms = COALESCE(
    (meta->'building'->>'bedrooms')::int,
    (meta->>'bedrooms')::int,
    (meta->'summary'->>'bedrooms')::int
  ),
  bathrooms = COALESCE(
    (meta->'building'->>'bathrooms')::numeric,
    (meta->>'bathrooms')::numeric,
    (meta->'summary'->>'bathrooms')::numeric,
    (meta->'building'->>'bathsFull')::numeric
  ),
  living_sqft = COALESCE(
    (meta->'building'->>'livingSquareFeet')::int,
    (meta->>'livingSquareFeet')::int,
    (meta->'building'->>'squareFeet')::int,
    (meta->>'squareFeet')::int,
    (meta->'summary'->>'livingSquareFeet')::int
  )
WHERE meta IS NOT NULL AND meta != '{}'::jsonb;
