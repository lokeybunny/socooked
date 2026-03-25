ALTER TABLE public.shill_scheduled_posts 
ADD COLUMN IF NOT EXISTS repeat_daily boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS all_mode boolean NOT NULL DEFAULT false;