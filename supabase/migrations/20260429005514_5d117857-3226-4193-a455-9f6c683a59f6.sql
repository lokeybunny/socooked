
-- ============================================
-- HOOK REPLY THREADS
-- ============================================
CREATE TABLE public.hook_reply_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL,
  phone_last10 text NOT NULL,
  original_outbound_id uuid NULL,
  original_outbound_body text NULL,
  inbound_message_id uuid NULL,
  inbound_body text NULL,
  inbound_at timestamptz NULL,
  sentiment text NOT NULL DEFAULT 'pending',
  status text NOT NULL DEFAULT 'awaiting_reply',
  followup_send_at timestamptz NULL,
  followup_sent_at timestamptz NULL,
  followup_message_id uuid NULL,
  dnd_reason text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hook_reply_threads_phone10 ON public.hook_reply_threads(phone_last10);
CREATE INDEX idx_hook_reply_threads_status ON public.hook_reply_threads(status);
CREATE INDEX idx_hook_reply_threads_followup ON public.hook_reply_threads(followup_send_at) WHERE status = 'followup_scheduled';

ALTER TABLE public.hook_reply_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view hook reply threads"
  ON public.hook_reply_threads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert hook reply threads"
  ON public.hook_reply_threads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update hook reply threads"
  ON public.hook_reply_threads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete hook reply threads"
  ON public.hook_reply_threads FOR DELETE TO authenticated USING (true);

-- Service role bypasses RLS automatically; no policy needed.

CREATE TRIGGER trg_hook_reply_threads_updated
  BEFORE UPDATE ON public.hook_reply_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- SMS DND LIST
-- ============================================
CREATE TABLE public.sms_dnd_list (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL,
  phone_last10 text NOT NULL UNIQUE,
  reason text NULL,
  source text NOT NULL DEFAULT 'manual',
  original_message_body text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sms_dnd_phone10 ON public.sms_dnd_list(phone_last10);

ALTER TABLE public.sms_dnd_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view DND list"
  ON public.sms_dnd_list FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert DND list"
  ON public.sms_dnd_list FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update DND list"
  ON public.sms_dnd_list FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete DND list"
  ON public.sms_dnd_list FOR DELETE TO authenticated USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.hook_reply_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_dnd_list;
