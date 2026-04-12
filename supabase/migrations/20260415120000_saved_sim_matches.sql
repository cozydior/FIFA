-- Persisted match simulations for replay pages (shots + lineups snapshot)

CREATE TABLE IF NOT EXISTS public.saved_sim_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_label text NOT NULL,
  home_team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  away_team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  home_score integer NOT NULL,
  away_score integer NOT NULL,
  fixture_id uuid REFERENCES public.fixtures (id) ON DELETE SET NULL,
  shots jsonb NOT NULL DEFAULT '[]'::jsonb,
  lineups jsonb NOT NULL DEFAULT '{}'::jsonb,
  player_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_sim_matches_home_created_idx
  ON public.saved_sim_matches (home_team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS saved_sim_matches_away_created_idx
  ON public.saved_sim_matches (away_team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS saved_sim_matches_season_idx
  ON public.saved_sim_matches (season_label);

ALTER TABLE public.saved_sim_matches ENABLE ROW LEVEL SECURITY;
