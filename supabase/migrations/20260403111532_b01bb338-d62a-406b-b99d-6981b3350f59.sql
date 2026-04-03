DROP INDEX IF EXISTS customers_phone_unique;
CREATE UNIQUE INDEX customers_phone_source_unique ON public.customers (phone, source) WHERE (phone IS NOT NULL AND phone <> '');