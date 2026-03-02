
CREATE TABLE public.narrative_evolution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  coin_name text NOT NULL,
  ticker text NOT NULL,
  tagline text,
  categories text[] NOT NULL DEFAULT '{}',
  liquidity_ignition_score integer NOT NULL DEFAULT 0,
  score_repeatability integer DEFAULT 5,
  score_tribal integer DEFAULT 5,
  score_simplicity integer DEFAULT 5,
  score_screenshot integer DEFAULT 5,
  score_shock integer DEFAULT 5,
  score_degen_humor integer DEFAULT 5,
  score_community_nickname integer DEFAULT 5,
  score_pump_velocity integer DEFAULT 5,
  score_exit_flexibility integer DEFAULT 5,
  pump_probability integer DEFAULT 50,
  lore_origin text,
  coin_name_pattern text,
  category_blend_key text,
  generation_batch uuid,
  is_top_performer boolean NOT NULL DEFAULT false
);

ALTER TABLE public.narrative_evolution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "narrative_evolution_all_access" ON public.narrative_evolution FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_narrative_evolution_score ON public.narrative_evolution (liquidity_ignition_score DESC);
CREATE INDEX idx_narrative_evolution_top ON public.narrative_evolution (is_top_performer) WHERE is_top_performer = true;
CREATE INDEX idx_narrative_evolution_categories ON public.narrative_evolution USING gin (categories);
