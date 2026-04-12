-- International competitions and fixtures (separate from club leagues)

CREATE TABLE IF NOT EXISTS public.international_competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_label text NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_label, slug)
);

CREATE TABLE IF NOT EXISTS public.international_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.international_competitions (id) ON DELETE CASCADE,
  national_team_id uuid NOT NULL REFERENCES public.national_teams (id) ON DELETE CASCADE,
  group_name text,
  seed int,
  UNIQUE (competition_id, national_team_id)
);

CREATE TABLE IF NOT EXISTS public.international_fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.international_competitions (id) ON DELETE CASCADE,
  stage text NOT NULL,
  group_name text,
  week int NOT NULL,
  home_national_team_id uuid NOT NULL REFERENCES public.national_teams (id) ON DELETE CASCADE,
  away_national_team_id uuid NOT NULL REFERENCES public.national_teams (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'scheduled',
  home_score int,
  away_score int,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (home_national_team_id <> away_national_team_id)
);

CREATE INDEX IF NOT EXISTS intl_competitions_season_idx ON public.international_competitions (season_label);
CREATE INDEX IF NOT EXISTS intl_fixtures_competition_idx ON public.international_fixtures (competition_id, week);

ALTER TABLE public.international_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.international_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.international_fixtures ENABLE ROW LEVEL SECURITY;

