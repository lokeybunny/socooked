ALTER TABLE public.powerdial_call_logs 
ADD COLUMN IF NOT EXISTS ai_sentiment text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_reason text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_interested boolean DEFAULT NULL;