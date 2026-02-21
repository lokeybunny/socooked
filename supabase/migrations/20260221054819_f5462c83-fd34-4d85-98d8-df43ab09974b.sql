-- Add a unique upload token to each customer for their custom upload portal
ALTER TABLE public.customers ADD COLUMN upload_token text UNIQUE DEFAULT NULL;

-- Create index for fast token lookups on the public upload page
CREATE INDEX idx_customers_upload_token ON public.customers (upload_token) WHERE upload_token IS NOT NULL;