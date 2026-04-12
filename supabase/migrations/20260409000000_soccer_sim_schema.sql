-- Soccer Sim — initial schema
-- Run with Supabase CLI: supabase db push
-- Or paste into SQL Editor in the Supabase dashboard.

-- -----------------------------------------------------------------------------
-- Leagues
-- -----------------------------------------------------------------------------
CREATE TABLE public.leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text NOT NULL,
  division text NOT NULL CHECK (division IN ('D1', 'D2')),
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leagues_country_idx ON public.leagues (country);

-- -----------------------------------------------------------------------------
-- Teams
-- -----------------------------------------------------------------------------
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  budget numeric NOT NULL DEFAULT 25000000,
  country text NOT NULL,
  league_id uuid REFERENCES public.leagues (id) ON DELETE SET NULL,
  trophies jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_balance numeric NOT NULL DEFAULT 25000000,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX teams_league_id_idx ON public.teams (league_id);
CREATE INDEX teams_country_idx ON public.teams (country);

-- -----------------------------------------------------------------------------
-- Players
-- -----------------------------------------------------------------------------
CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  nationality text NOT NULL,
  role text NOT NULL CHECK (role IN ('ST', 'GK')),
  rating integer NOT NULL CHECK (rating >= 0 AND rating <= 100),
  market_value numeric NOT NULL DEFAULT 0,
  profile_pic_url text,
  team_id uuid REFERENCES public.teams (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX players_team_id_idx ON public.players (team_id);

-- -----------------------------------------------------------------------------
-- Stats (per player per season)
-- -----------------------------------------------------------------------------
CREATE TABLE public.stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players (id) ON DELETE CASCADE,
  season text NOT NULL,
  goals integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  appearances integer NOT NULL DEFAULT 0,
  average_rating numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, season)
);

CREATE INDEX stats_player_id_idx ON public.stats (player_id);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- Service role (server-side admin API) bypasses RLS.
-- Add SELECT policies for anon/authenticated when you build the public app.
-- -----------------------------------------------------------------------------
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stats ENABLE ROW LEVEL SECURITY;

-- Optional seed (run in SQL Editor if you need leagues before using Admin → Edit league):
-- INSERT INTO public.leagues (name, country, division, logo_url) VALUES
--   ('Premier League', 'England', 'D1', NULL),
--   ('Championship', 'England', 'D2', NULL);
