ALTER TABLE public.studio_storyboards
ADD COLUMN IF NOT EXISTS first_frame_url text,
ADD COLUMN IF NOT EXISTS first_frame_path text;