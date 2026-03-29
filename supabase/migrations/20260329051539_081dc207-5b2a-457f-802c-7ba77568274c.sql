
-- Add extended distress intelligence fields to lw_sellers
ALTER TABLE public.lw_sellers
  ADD COLUMN IF NOT EXISTS equity_percent numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lien_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS foreclosure_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS auction_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS probate_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_and_clear boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS inherited_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS trust_owned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_occupied boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS condition_notes text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS latitude numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS longitude numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS import_batch_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_record_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS skip_trace_status text DEFAULT 'not_ready',
  ADD COLUMN IF NOT EXISTS skip_trace_vendor text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS skip_trace_submitted_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS skip_trace_completed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phones_found_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_found_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_contact_confidence integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_quality_grade text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS buyer_match_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opportunity_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distress_grade text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lead_temperature text DEFAULT NULL;

-- Index for common filter patterns
CREATE INDEX IF NOT EXISTS idx_lw_sellers_distress_grade ON public.lw_sellers(distress_grade);
CREATE INDEX IF NOT EXISTS idx_lw_sellers_lead_temperature ON public.lw_sellers(lead_temperature);
CREATE INDEX IF NOT EXISTS idx_lw_sellers_opportunity_score ON public.lw_sellers(opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_lw_sellers_buyer_match_score ON public.lw_sellers(buyer_match_score DESC);
CREATE INDEX IF NOT EXISTS idx_lw_sellers_skip_trace_status ON public.lw_sellers(skip_trace_status);
CREATE INDEX IF NOT EXISTS idx_lw_sellers_import_batch ON public.lw_sellers(import_batch_id);
