ALTER TABLE public.lw_landing_leads
ADD COLUMN IF NOT EXISTS ai_notes text,
ADD COLUMN IF NOT EXISTS vapi_call_id text,
ADD COLUMN IF NOT EXISTS vapi_call_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS timeline text,
ADD COLUMN IF NOT EXISTS property_condition text,
ADD COLUMN IF NOT EXISTS motivation text,
ADD COLUMN IF NOT EXISTS asking_price numeric,
ADD COLUMN IF NOT EXISTS lead_score integer DEFAULT 0;