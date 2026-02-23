
-- 1. Enable the http extension
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- 2. Drop the restrictive source check on webhook_events and replace with one that includes 'spacebot'
ALTER TABLE public.webhook_events DROP CONSTRAINT IF EXISTS webhook_events_source_check;
ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_source_check CHECK (source IN ('spacebot', 'ringcentral', 'instagram', 'manychat', 'telegram', 'gmail', 'system', 'v0', 'manual'));
