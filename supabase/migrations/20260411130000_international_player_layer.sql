-- International callups + per-competition player international stats

CREATE TABLE IF NOT EXISTS public.national_team_callups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_label text NOT NULL,
  national_team_id uuid NOT NULL REFERENCES public.national_teams (id) ON DELETE CASCADE,
  slot text NOT NULL CHECK (slot IN ('ST1', 'ST2', 'GK1')),
  player_id uuid NOT NULL REFERENCES public.players (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_label, national_team_id, slot),
  UNIQUE (season_label, national_team_id, player_id)
);

CREATE INDEX IF NOT EXISTS national_team_callups_season_idx
  ON public.national_team_callups (season_label, national_team_id);

CREATE TABLE IF NOT EXISTS public.player_international_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players (id) ON DELETE CASCADE,
  season_label text NOT NULL,
  competition_slug text NOT NULL,
  caps integer NOT NULL DEFAULT 0,
  goals_for_country integer NOT NULL DEFAULT 0,
  saves_for_country integer NOT NULL DEFAULT 0,
  average_rating numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, season_label, competition_slug)
);

CREATE INDEX IF NOT EXISTS player_international_stats_player_idx
  ON public.player_international_stats (player_id);

ALTER TABLE public.national_team_callups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_international_stats ENABLE ROW LEVEL SECURITY;

