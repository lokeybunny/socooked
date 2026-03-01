
CREATE TABLE public.x_feed_tweets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tweet_text text NOT NULL,
  author_username text NOT NULL DEFAULT '',
  author_display_name text NOT NULL DEFAULT '',
  author_avatar text DEFAULT '',
  source_url text DEFAULT '',
  media_url text DEFAULT '',
  likes integer NOT NULL DEFAULT 0,
  retweets integer NOT NULL DEFAULT 0,
  replies integer NOT NULL DEFAULT 0,
  views integer NOT NULL DEFAULT 0,
  verified boolean NOT NULL DEFAULT false,
  gold boolean NOT NULL DEFAULT false,
  raw_message text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.x_feed_tweets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "x_feed_tweets_all_access" ON public.x_feed_tweets FOR ALL USING (true) WITH CHECK (true);
