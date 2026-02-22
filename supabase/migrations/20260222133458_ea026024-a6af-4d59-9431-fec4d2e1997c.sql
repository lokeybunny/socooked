
-- Calendar events table for manual reminders and Google Calendar synced events
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  all_day BOOLEAN NOT NULL DEFAULT false,
  color TEXT DEFAULT '#3b82f6',
  location TEXT,
  reminder_minutes INTEGER DEFAULT 15,
  recurrence TEXT, -- e.g. 'daily', 'weekly', 'monthly'
  source TEXT NOT NULL DEFAULT 'manual', -- manual, google-calendar
  source_id TEXT, -- Google Calendar event ID
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_events_all_access"
  ON public.calendar_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER set_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
