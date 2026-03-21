
-- 1. reply_engine_posts
CREATE TABLE public.reply_engine_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'x',
  external_post_id text,
  post_url text,
  author_handle text,
  author_display_name text,
  text_content text,
  media_urls jsonb DEFAULT '[]'::jsonb,
  category text,
  niche text,
  score numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rep_posts_status ON public.reply_engine_posts(status);
CREATE INDEX idx_rep_posts_created ON public.reply_engine_posts(created_at DESC);
ALTER TABLE public.reply_engine_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reply_engine_posts_all" ON public.reply_engine_posts FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. reply_suggestions
CREATE TABLE public.reply_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.reply_engine_posts(id) ON DELETE CASCADE,
  variant_name text NOT NULL,
  suggested_reply text NOT NULL,
  tone text,
  model_name text,
  generation_status text NOT NULL DEFAULT 'generated',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rep_sugg_post ON public.reply_suggestions(post_id);
ALTER TABLE public.reply_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reply_suggestions_all" ON public.reply_suggestions FOR ALL TO public USING (true) WITH CHECK (true);

-- 3. reply_reviews
CREATE TABLE public.reply_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.reply_engine_posts(id) ON DELETE CASCADE,
  selected_reply_suggestion_id uuid REFERENCES public.reply_suggestions(id) ON DELETE SET NULL,
  edited_reply text,
  status text NOT NULL DEFAULT 'needs_review',
  reviewer_user_id uuid,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rep_reviews_post ON public.reply_reviews(post_id);
CREATE INDEX idx_rep_reviews_status ON public.reply_reviews(status);
ALTER TABLE public.reply_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reply_reviews_all" ON public.reply_reviews FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. outbound_accounts
CREATE TABLE public.outbound_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'x',
  account_label text NOT NULL,
  account_identifier text NOT NULL,
  provider text NOT NULL DEFAULT 'upload-post',
  is_authorized boolean NOT NULL DEFAULT false,
  auto_send_enabled boolean NOT NULL DEFAULT false,
  daily_limit integer NOT NULL DEFAULT 25,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.outbound_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outbound_accounts_all" ON public.outbound_accounts FOR ALL TO public USING (true) WITH CHECK (true);

-- 5. outbound_attempts
CREATE TABLE public.outbound_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_review_id uuid NOT NULL REFERENCES public.reply_reviews(id) ON DELETE CASCADE,
  outbound_account_id uuid NOT NULL REFERENCES public.outbound_accounts(id) ON DELETE CASCADE,
  request_payload jsonb DEFAULT '{}'::jsonb,
  response_payload jsonb DEFAULT '{}'::jsonb,
  provider_message_id text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbound_att_review ON public.outbound_attempts(reply_review_id);
CREATE INDEX idx_outbound_att_status ON public.outbound_attempts(status);
ALTER TABLE public.outbound_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outbound_attempts_all" ON public.outbound_attempts FOR ALL TO public USING (true) WITH CHECK (true);

-- 6. reply_engine_settings
CREATE TABLE public.reply_engine_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reply_engine_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reply_engine_settings_all" ON public.reply_engine_settings FOR ALL TO public USING (true) WITH CHECK (true);

-- 7. reply_engine_audit_logs
CREATE TABLE public.reply_engine_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rep_audit_created ON public.reply_engine_audit_logs(created_at DESC);
CREATE INDEX idx_rep_audit_entity ON public.reply_engine_audit_logs(entity_type, entity_id);
ALTER TABLE public.reply_engine_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reply_engine_audit_logs_all" ON public.reply_engine_audit_logs FOR ALL TO public USING (true) WITH CHECK (true);
