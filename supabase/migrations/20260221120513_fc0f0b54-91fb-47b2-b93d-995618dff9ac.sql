
-- Add customer_id to meetings table for auto-linking recordings
ALTER TABLE public.meetings ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
