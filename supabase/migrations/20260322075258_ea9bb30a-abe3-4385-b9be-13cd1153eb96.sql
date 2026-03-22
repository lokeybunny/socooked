
CREATE TABLE public.discord_notify_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id text NOT NULL UNIQUE,
  discord_username text NOT NULL DEFAULT '',
  notify_discord_dm boolean NOT NULL DEFAULT false,
  notify_telegram boolean NOT NULL DEFAULT false,
  telegram_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.discord_notify_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discord_notify_prefs_all_access" ON public.discord_notify_prefs
  FOR ALL USING (true) WITH CHECK (true);
