-- Pillar 1: countries, player hidden OVR + age, finance + MV history
-- Run the full file top-to-bottom. INSERTs require leagues.country_id (added below).

CREATE TABLE IF NOT EXISTS public.countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL
);

INSERT INTO public.countries (code, name) VALUES
  ('ENG', 'England'),
  ('ESP', 'Spain'),
  ('FRA', 'France')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES public.countries (id) ON DELETE SET NULL;

UPDATE public.leagues l
SET country_id = c.id
FROM public.countries c
WHERE l.country_id IS NULL AND LOWER(TRIM(l.country)) = LOWER(TRIM(c.name));

CREATE UNIQUE INDEX IF NOT EXISTS leagues_country_id_division_uidx
  ON public.leagues (country_id, division)
  WHERE country_id IS NOT NULL;

-- Domestic pyramid: one WHERE on SELECT (AND NOT EXISTS); idempotent per country+division
INSERT INTO public.leagues (name, country, division, country_id)
SELECT 'Premier League', 'England', 'D1', c.id
FROM public.countries c
WHERE c.code = 'ENG'
  AND NOT EXISTS (
    SELECT 1 FROM public.leagues l
    WHERE l.division = 'D1' AND l.country_id = c.id
  );

INSERT INTO public.leagues (name, country, division, country_id)
SELECT 'EFL Championship', 'England', 'D2', c.id
FROM public.countries c
WHERE c.code = 'ENG'
  AND NOT EXISTS (
    SELECT 1 FROM public.leagues l
    WHERE l.division = 'D2' AND l.country_id = c.id
  );

INSERT INTO public.leagues (name, country, division, country_id)
SELECT 'La Liga', 'Spain', 'D1', c.id
FROM public.countries c
WHERE c.code = 'ESP'
  AND NOT EXISTS (
    SELECT 1 FROM public.leagues l
    WHERE l.division = 'D1' AND l.country_id = c.id
  );

INSERT INTO public.leagues (name, country, division, country_id)
SELECT 'La Liga 2', 'Spain', 'D2', c.id
FROM public.countries c
WHERE c.code = 'ESP'
  AND NOT EXISTS (
    SELECT 1 FROM public.leagues l
    WHERE l.division = 'D2' AND l.country_id = c.id
  );

INSERT INTO public.leagues (name, country, division, country_id)
SELECT 'Ligue 1', 'France', 'D1', c.id
FROM public.countries c
WHERE c.code = 'FRA'
  AND NOT EXISTS (
    SELECT 1 FROM public.leagues l
    WHERE l.division = 'D1' AND l.country_id = c.id
  );

INSERT INTO public.leagues (name, country, division, country_id)
SELECT 'Ligue 2', 'France', 'D2', c.id
FROM public.countries c
WHERE c.code = 'FRA'
  AND NOT EXISTS (
    SELECT 1 FROM public.leagues l
    WHERE l.division = 'D2' AND l.country_id = c.id
  );

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS hidden_ovr integer NOT NULL DEFAULT 50
    CHECK (hidden_ovr >= 0 AND hidden_ovr <= 100);

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS age integer NOT NULL DEFAULT 24
    CHECK (age >= 16 AND age <= 50);

UPDATE public.players SET hidden_ovr = rating;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS peak_market_value numeric NOT NULL DEFAULT 0;

UPDATE public.players
SET peak_market_value = GREATEST(COALESCE(market_value, 0), peak_market_value);

CREATE TABLE IF NOT EXISTS public.player_market_value_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players (id) ON DELETE CASCADE,
  season_label text NOT NULL,
  market_value numeric NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, season_label)
);

CREATE INDEX IF NOT EXISTS player_mv_history_player_idx ON public.player_market_value_history (player_id);

CREATE TABLE IF NOT EXISTS public.team_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  season_label text NOT NULL,
  amount numeric NOT NULL,
  category text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_transactions_team_season_idx ON public.team_transactions (team_id, season_label);

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS last_wages_season text;

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_market_value_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_transactions ENABLE ROW LEVEL SECURITY;
