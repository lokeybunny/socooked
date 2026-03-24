CREATE TABLE public.shill_scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL,
  caption text NOT NULL,
  video_url text NOT NULL,
  storage_path text,
  community_id text NOT NULL DEFAULT '2029596385180291485',
  x_account text NOT NULL DEFAULT 'xslaves',
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  post_url text,
  request_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shill_scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shill_scheduled_posts_all_access" ON public.shill_scheduled_posts
  FOR ALL TO public USING (true) WITH CHECK (true);

CREATE TRIGGER set_shill_scheduled_posts_updated_at
  BEFORE UPDATE ON public.shill_scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();