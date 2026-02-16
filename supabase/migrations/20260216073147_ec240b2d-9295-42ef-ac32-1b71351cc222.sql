
-- Create meetings table
CREATE TABLE public.meetings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id uuid REFERENCES public.profiles(id),
  room_code text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  title text NOT NULL DEFAULT 'Meeting',
  scheduled_at timestamp with time zone,
  status text NOT NULL DEFAULT 'waiting',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "meetings_all_access" ON public.meetings FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for signaling
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
