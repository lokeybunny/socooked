
-- Add client_password and client_user_id columns to landing pages
ALTER TABLE public.lw_landing_pages 
  ADD COLUMN IF NOT EXISTS client_password text,
  ADD COLUMN IF NOT EXISTS client_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add source_landing_page_id to lw_landing_leads for Vapi source tracking  
-- (already has landing_page_id, but ensure it's there)

-- Add vapi_recording_url column for download capability
ALTER TABLE public.lw_landing_leads
  ADD COLUMN IF NOT EXISTS vapi_recording_url text;

-- Create a table to track weekly lead caps per client
CREATE TABLE IF NOT EXISTS public.lw_client_lead_caps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id uuid REFERENCES public.lw_landing_pages(id) ON DELETE CASCADE NOT NULL,
  week_start date NOT NULL,
  leads_delivered integer NOT NULL DEFAULT 0,
  cap integer NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(landing_page_id, week_start)
);

ALTER TABLE public.lw_client_lead_caps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lw_client_lead_caps_auth_access" ON public.lw_client_lead_caps
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
