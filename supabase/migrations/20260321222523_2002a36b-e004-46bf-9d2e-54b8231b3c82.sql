CREATE TABLE public.shill_post_analytics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tweet_url text NOT NULL,
  tweet_id text,
  author_handle text,
  author_name text,
  text_content text,
  likes integer NOT NULL DEFAULT 0,
  retweets integer NOT NULL DEFAULT 0,
  replies integer NOT NULL DEFAULT 0,
  views integer NOT NULL DEFAULT 0,
  posted_at timestamp with time zone,
  detected_at timestamp with time zone NOT NULL DEFAULT now(),
  discord_msg_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tweet_id)
);

ALTER TABLE public.shill_post_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shill_post_analytics_all_access" ON public.shill_post_analytics FOR ALL TO public USING (true) WITH CHECK (true);