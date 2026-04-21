
-- Sessions
CREATE TABLE public.analytics_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer DEFAULT 0,
  page_views_count integer DEFAULT 0,
  events_count integer DEFAULT 0,
  landing_path text,
  exit_path text,
  referrer text,
  referrer_domain text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  device_type text,
  browser text,
  os text,
  user_agent text,
  ip_hash text,
  country text,
  region text,
  city text,
  is_bounce boolean DEFAULT true,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_sessions_visitor ON public.analytics_sessions(visitor_id);
CREATE INDEX idx_analytics_sessions_started ON public.analytics_sessions(started_at DESC);
CREATE INDEX idx_analytics_sessions_last_seen ON public.analytics_sessions(last_seen_at DESC);
CREATE INDEX idx_analytics_sessions_landing ON public.analytics_sessions(landing_path);

-- Pageviews
CREATE TABLE public.analytics_pageviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.analytics_sessions(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  path text NOT NULL,
  title text,
  referrer text,
  time_on_page_seconds integer DEFAULT 0,
  scroll_depth_pct integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_pageviews_session ON public.analytics_pageviews(session_id);
CREATE INDEX idx_analytics_pageviews_path ON public.analytics_pageviews(path);
CREATE INDEX idx_analytics_pageviews_created ON public.analytics_pageviews(created_at DESC);

-- Events
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.analytics_sessions(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  event_name text NOT NULL,
  event_label text,
  event_value numeric,
  path text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_events_session ON public.analytics_events(session_id);
CREATE INDEX idx_analytics_events_name ON public.analytics_events(event_name);
CREATE INDEX idx_analytics_events_created ON public.analytics_events(created_at DESC);

-- RLS
ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_pageviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Public can insert (tracker uses anon key)
CREATE POLICY "anyone can insert sessions" ON public.analytics_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone can update sessions" ON public.analytics_sessions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anyone can insert pageviews" ON public.analytics_pageviews FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone can insert events" ON public.analytics_events FOR INSERT WITH CHECK (true);

-- Admin only read/delete (warren@stu25.com)
CREATE POLICY "admin can read sessions" ON public.analytics_sessions FOR SELECT
  USING (auth.jwt() ->> 'email' = 'warren@stu25.com');
CREATE POLICY "admin can delete sessions" ON public.analytics_sessions FOR DELETE
  USING (auth.jwt() ->> 'email' = 'warren@stu25.com');

CREATE POLICY "admin can read pageviews" ON public.analytics_pageviews FOR SELECT
  USING (auth.jwt() ->> 'email' = 'warren@stu25.com');
CREATE POLICY "admin can delete pageviews" ON public.analytics_pageviews FOR DELETE
  USING (auth.jwt() ->> 'email' = 'warren@stu25.com');

CREATE POLICY "admin can read events" ON public.analytics_events FOR SELECT
  USING (auth.jwt() ->> 'email' = 'warren@stu25.com');
CREATE POLICY "admin can delete events" ON public.analytics_events FOR DELETE
  USING (auth.jwt() ->> 'email' = 'warren@stu25.com');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_pageviews;
ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_events;
