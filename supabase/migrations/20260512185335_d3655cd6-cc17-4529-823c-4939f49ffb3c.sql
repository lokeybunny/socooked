
CREATE TABLE IF NOT EXISTS public.hot_reply_sync_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sheet_url text,
  sheet_name text DEFAULT 'Sheet1',
  last_sync_at timestamptz,
  sync_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hot_reply_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_row_id text,
  first_name text,
  last_name text,
  phone text NOT NULL,
  reply_text text NOT NULL,
  campaign_name text,
  source text,
  original_date text,
  original_time text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  ai_classification text,
  ai_confidence numeric,
  ai_reason text,
  is_hot boolean NOT NULL DEFAULT false,
  is_opt_out boolean NOT NULL DEFAULT false,
  call_status text NOT NULL DEFAULT 'not_called',
  assigned_to uuid,
  notes text,
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hri_phone ON public.hot_reply_imports(phone);
CREATE INDEX IF NOT EXISTS idx_hri_class ON public.hot_reply_imports(ai_classification);
CREATE INDEX IF NOT EXISTS idx_hri_hot ON public.hot_reply_imports(is_hot);
CREATE INDEX IF NOT EXISTS idx_hri_imported ON public.hot_reply_imports(imported_at DESC);

CREATE TABLE IF NOT EXISTS public.hot_reply_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hot_reply_id uuid NOT NULL REFERENCES public.hot_reply_imports(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hrn_reply ON public.hot_reply_notes(hot_reply_id);

ALTER TABLE public.hot_reply_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hot_reply_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hot_reply_sync_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read imports" ON public.hot_reply_imports FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write imports" ON public.hot_reply_imports FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth read notes" ON public.hot_reply_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write notes" ON public.hot_reply_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth read settings" ON public.hot_reply_sync_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write settings" ON public.hot_reply_sync_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_hri_updated BEFORE UPDATE ON public.hot_reply_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_hrss_updated BEFORE UPDATE ON public.hot_reply_sync_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
