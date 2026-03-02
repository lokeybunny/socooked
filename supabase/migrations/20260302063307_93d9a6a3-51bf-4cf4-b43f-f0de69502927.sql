
-- Meta mentions table for tracking categories from channel -1003804658600
CREATE TABLE public.meta_mentions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  category_normalized text NOT NULL,
  message_id text,
  source_text_snippet text,
  count integer NOT NULL DEFAULT 1,
  telegram_channel_id bigint DEFAULT -1003804658600
);

-- Hourly meta summary for bullish tracking
CREATE TABLE public.hourly_meta_summary (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date_hour timestamptz NOT NULL,
  category text NOT NULL,
  mentions_hour integer NOT NULL DEFAULT 0,
  hours_today integer NOT NULL DEFAULT 0,
  bullish_score integer NOT NULL DEFAULT 0,
  is_green boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- DEV AI generated narratives history
CREATE TABLE public.dev_ai_narratives (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_name text NOT NULL,
  token_symbol text NOT NULL,
  narrative text NOT NULL,
  source_platform text,
  source_url text,
  image_url text,
  image_prompt text,
  meta_categories jsonb DEFAULT '[]'::jsonb,
  context_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies (open access like other tables)
ALTER TABLE public.meta_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_mentions_all_access" ON public.meta_mentions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.hourly_meta_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hourly_meta_summary_all_access" ON public.hourly_meta_summary FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.dev_ai_narratives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_ai_narratives_all_access" ON public.dev_ai_narratives FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for meta_mentions
ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_mentions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hourly_meta_summary;
