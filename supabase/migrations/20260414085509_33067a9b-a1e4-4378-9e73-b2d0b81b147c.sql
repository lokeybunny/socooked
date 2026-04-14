ALTER TABLE public.powerdial_campaigns 
ADD COLUMN IF NOT EXISTS scheduled_start timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS schedule_status text DEFAULT NULL;