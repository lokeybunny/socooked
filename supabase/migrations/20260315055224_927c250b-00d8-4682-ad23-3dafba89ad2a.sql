
CREATE TABLE public.smm_boost_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_username text NOT NULL DEFAULT 'STU25',
  post_id text,
  schedule_item_id text,
  plan_id uuid REFERENCES public.smm_content_plans(id) ON DELETE SET NULL,
  platform text NOT NULL,
  service_id text NOT NULL,
  service_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 100,
  link text,
  order_id text,
  status text NOT NULL DEFAULT 'pending',
  charge numeric DEFAULT 0,
  start_count integer,
  remains integer,
  darkside_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.smm_boost_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "smm_boost_orders_all_access" ON public.smm_boost_orders FOR ALL TO public USING (true) WITH CHECK (true);
