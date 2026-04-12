-- Track shot attempts (ST) and shots faced (GK) per international competition row, same as club Matchday sim.
ALTER TABLE public.player_international_stats
  ADD COLUMN IF NOT EXISTS shots_taken integer NOT NULL DEFAULT 0;

ALTER TABLE public.player_international_stats
  ADD COLUMN IF NOT EXISTS shots_faced integer NOT NULL DEFAULT 0;
