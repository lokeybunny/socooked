
CREATE TABLE public.ig_dm_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  profile text,
  other_username text,
  score integer NOT NULL DEFAULT 0,
  stage text,
  qualified boolean NOT NULL DEFAULT false,
  next_action text,
  reason text,
  reply text,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  manual_override jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_reply boolean NOT NULL DEFAULT false,
  basis_msg_id text,
  bot_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, conversation_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ig_dm_analyses TO authenticated;
GRANT ALL ON public.ig_dm_analyses TO service_role;
ALTER TABLE public.ig_dm_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own ig_dm_analyses"
  ON public.ig_dm_analyses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER ig_dm_analyses_set_updated_at
  BEFORE UPDATE ON public.ig_dm_analyses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX ig_dm_analyses_user_conv_idx ON public.ig_dm_analyses (user_id, conversation_id);

CREATE TABLE public.ig_dm_user_settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  auto_bot boolean NOT NULL DEFAULT false,
  selected_profile text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ig_dm_user_settings TO authenticated;
GRANT ALL ON public.ig_dm_user_settings TO service_role;
ALTER TABLE public.ig_dm_user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own ig_dm_user_settings"
  ON public.ig_dm_user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER ig_dm_user_settings_set_updated_at
  BEFORE UPDATE ON public.ig_dm_user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
