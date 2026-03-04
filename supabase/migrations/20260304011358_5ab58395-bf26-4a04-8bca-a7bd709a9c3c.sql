-- Add Square invoice tracking columns
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS square_invoice_id text,
  ADD COLUMN IF NOT EXISTS square_invoice_version integer;