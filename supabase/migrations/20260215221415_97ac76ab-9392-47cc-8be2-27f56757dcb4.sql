
-- Add professional invoice fields
ALTER TABLE public.invoices 
  ADD COLUMN invoice_number text,
  ADD COLUMN due_date date,
  ADD COLUMN line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN notes text,
  ADD COLUMN tax_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN subtotal numeric NOT NULL DEFAULT 0;

-- Create sequence for invoice numbers
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1001;

-- Auto-generate invoice number on insert
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' || LPAD(nextval('invoice_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_invoice_number();
