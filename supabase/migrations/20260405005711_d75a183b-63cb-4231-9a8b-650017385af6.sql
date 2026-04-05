
-- Stores table
CREATE TABLE public.arbitrage_stores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_name TEXT NOT NULL,
  address TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  notes TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.arbitrage_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arbitrage_stores_auth_access" ON public.arbitrage_stores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add store_id and contact fields to arbitrage_items
ALTER TABLE public.arbitrage_items
  ADD COLUMN store_id UUID REFERENCES public.arbitrage_stores(id) ON DELETE SET NULL,
  ADD COLUMN contact_name TEXT,
  ADD COLUMN contact_phone TEXT;

CREATE INDEX idx_arbitrage_items_store_id ON public.arbitrage_items(store_id);

-- Reminders table for 14-day workflow
CREATE TABLE public.arbitrage_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.arbitrage_items(id) ON DELETE CASCADE,
  reminder_date TIMESTAMPTZ NOT NULL,
  reminder_type TEXT NOT NULL DEFAULT 'availability_check',
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.arbitrage_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arbitrage_reminders_auth_access" ON public.arbitrage_reminders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_arbitrage_reminders_date ON public.arbitrage_reminders(reminder_date) WHERE NOT is_dismissed;

-- Trigger to auto-create 14-day reminder when a new arbitrage item is inserted
CREATE OR REPLACE FUNCTION public.create_arbitrage_reminder()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.arbitrage_reminders (item_id, reminder_date, reminder_type)
  VALUES (NEW.id, NEW.created_at + INTERVAL '14 days', 'availability_check');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_arbitrage_item_reminder
  AFTER INSERT ON public.arbitrage_items
  FOR EACH ROW
  EXECUTE FUNCTION public.create_arbitrage_reminder();
