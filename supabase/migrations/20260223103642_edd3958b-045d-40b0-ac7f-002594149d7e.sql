
-- Weekly availability slots (like Calendly availability windows)
CREATE TABLE public.availability_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage, public can read active slots
CREATE POLICY "Anyone can view active availability" ON public.availability_slots
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage availability" ON public.availability_slots
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Bookings table
CREATE TABLE public.bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  guest_phone text,
  meeting_id uuid REFERENCES public.meetings(id),
  room_code text,
  status text NOT NULL DEFAULT 'confirmed',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Public can insert (book), authenticated can manage
CREATE POLICY "Anyone can create bookings" ON public.bookings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view bookings" ON public.bookings
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage bookings" ON public.bookings
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Trigger for updated_at
CREATE TRIGGER set_availability_updated_at BEFORE UPDATE ON public.availability_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_bookings_updated_at BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
