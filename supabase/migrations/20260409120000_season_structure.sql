-- Seasons, fixtures calendar, tournaments (e.g. Champions League qualifiers)

CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  season_id uuid NOT NULL REFERENCES public.seasons (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, season_id)
);

CREATE TABLE public.tournament_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments (id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  qualified_via text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, team_id)
);

CREATE INDEX tournament_entries_team_id_idx ON public.tournament_entries (team_id);

CREATE TABLE public.fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_label text NOT NULL,
  competition text NOT NULL CHECK (competition IN ('league', 'regional_cup')),
  league_id uuid REFERENCES public.leagues (id) ON DELETE SET NULL,
  country text,
  home_team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  away_team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  week int NOT NULL,
  cup_round text,
  leg int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'scheduled',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (home_team_id <> away_team_id)
);

CREATE INDEX fixtures_season_week_idx ON public.fixtures (season_label, week);
CREATE INDEX fixtures_league_id_idx ON public.fixtures (league_id);

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixtures ENABLE ROW LEVEL SECURITY;
