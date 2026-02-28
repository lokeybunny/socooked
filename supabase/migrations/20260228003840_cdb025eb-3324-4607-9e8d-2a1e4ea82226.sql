-- Create shared SMM conversation table for real-time sync between Telegram and web
CREATE TABLE public.smm_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_username TEXT NOT NULL DEFAULT 'STU25',
  platform TEXT NOT NULL DEFAULT 'instagram',
  source TEXT NOT NULL DEFAULT 'web', -- 'web' or 'telegram'
  role TEXT NOT NULL DEFAULT 'user', -- 'user' or 'cortex'
  message TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.smm_conversations ENABLE ROW LEVEL SECURITY;

-- Allow all access (matches existing pattern)
CREATE POLICY "smm_conversations_all_access" ON public.smm_conversations FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.smm_conversations;

-- Index for fast lookups
CREATE INDEX idx_smm_conversations_profile_platform ON public.smm_conversations (profile_username, platform, created_at);