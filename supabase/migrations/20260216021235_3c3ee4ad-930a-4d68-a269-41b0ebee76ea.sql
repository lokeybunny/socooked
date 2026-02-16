
ALTER TABLE public.boards ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX idx_boards_customer_id ON public.boards(customer_id);
