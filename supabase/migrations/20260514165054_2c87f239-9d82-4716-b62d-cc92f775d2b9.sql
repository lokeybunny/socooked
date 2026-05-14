
CREATE TABLE IF NOT EXISTS public.auto_callback_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  phone_last10 text NOT NULL,
  customer_id uuid,
  source_vapi_call_id text,
  source_missed_call_event_id uuid,
  scheduled_at timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  twilio_call_sid text,
  answered_by text,
  delivered_at timestamptz,
  last_error text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auto_callback_queue_due_idx
  ON public.auto_callback_queue (scheduled_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS auto_callback_queue_phone_idx
  ON public.auto_callback_queue (phone_last10, created_at DESC);

ALTER TABLE public.auto_callback_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_callback_queue auth read"
  ON public.auto_callback_queue FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "auto_callback_queue auth write"
  ON public.auto_callback_queue FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER auto_callback_queue_set_updated_at
  BEFORE UPDATE ON public.auto_callback_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (key, value)
VALUES (
  'auto_callback_drop',
  jsonb_build_object(
    'enabled', true,
    'delay_minutes', 2,
    'audio_url', 'https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/content-uploads/audio/auto-callback-drop.mp3'
  )
)
ON CONFLICT (key) DO UPDATE SET value =
  COALESCE(public.app_settings.value, '{}'::jsonb) ||
  jsonb_build_object(
    'enabled', COALESCE((public.app_settings.value->>'enabled')::boolean, true),
    'delay_minutes', COALESCE((public.app_settings.value->>'delay_minutes')::int, 2),
    'audio_url', COALESCE(public.app_settings.value->>'audio_url',
      'https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/content-uploads/audio/auto-callback-drop.mp3')
  );

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
