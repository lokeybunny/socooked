CREATE TABLE public.smm_boost_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_username text NOT NULL DEFAULT 'STU25',
  preset_name text NOT NULL,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.smm_boost_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "smm_boost_presets_all_access" ON public.smm_boost_presets
  FOR ALL TO public
  USING (true) WITH CHECK (true);