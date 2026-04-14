
-- Saved lists: users save scraped leads into named lists
CREATE TABLE public.lh_saved_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled List',
  created_by UUID NOT NULL,
  lead_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lh_saved_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage saved lists"
  ON public.lh_saved_lists FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Items within saved lists
CREATE TABLE public.lh_saved_list_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID NOT NULL REFERENCES public.lh_saved_lists(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  address TEXT,
  rating NUMERIC,
  review_count INTEGER,
  negative_review TEXT,
  website TEXT,
  gmaps_url TEXT,
  category_name TEXT,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lh_saved_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage list items"
  ON public.lh_saved_list_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_lh_list_items_list ON public.lh_saved_list_items(list_id);
CREATE INDEX idx_lh_list_items_phone ON public.lh_saved_list_items(phone);

-- DNC (Do Not Call) registry: tracks phones that have been dialed 2+ times
CREATE TABLE public.lh_dnc_registry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL DEFAULT 'max_attempts',
  call_count INTEGER NOT NULL DEFAULT 0,
  last_called_at TIMESTAMPTZ,
  source_list_id UUID REFERENCES public.lh_saved_lists(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lh_dnc_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage DNC registry"
  ON public.lh_dnc_registry FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_lh_dnc_phone ON public.lh_dnc_registry(phone);

-- Trigger: auto-update updated_at on saved lists
CREATE TRIGGER update_lh_saved_lists_updated_at
  BEFORE UPDATE ON public.lh_saved_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
