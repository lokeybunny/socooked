
-- Content schedule plans: stores full content calendars Cortex generates
CREATE TABLE public.smm_content_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_username TEXT NOT NULL,
  platform TEXT NOT NULL, -- instagram, facebook, tiktok, x
  plan_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, active, completed, archived
  brand_context JSONB NOT NULL DEFAULT '{}'::jsonb, -- niche, voice, audience, keywords, hashtag_sets
  schedule_items JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of {date, time, type, caption, hashtags, media_prompt, media_url, status}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.smm_content_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "smm_content_plans_all_access" ON public.smm_content_plans
  FOR ALL USING (true) WITH CHECK (true);

-- Updated at trigger
CREATE TRIGGER set_smm_content_plans_updated_at
  BEFORE UPDATE ON public.smm_content_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Brand prompt library: reusable expert prompts for niche-specific content
CREATE TABLE public.smm_brand_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_username TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general', -- content_idea, caption, hashtag, visual, video_concept
  niche TEXT, -- e.g. 'restaurant', 'fitness', 'real-estate'
  prompt_text TEXT NOT NULL,
  example_output TEXT,
  effectiveness_score INTEGER DEFAULT 0, -- 0-100, updated by Cortex based on engagement
  times_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.smm_brand_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "smm_brand_prompts_all_access" ON public.smm_brand_prompts
  FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for content plans
ALTER PUBLICATION supabase_realtime ADD TABLE public.smm_content_plans;
