-- Add shots_taken (ST) and shots_faced (GK) columns to stats table.
ALTER TABLE public.stats
  ADD COLUMN IF NOT EXISTS shots_taken integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shots_faced integer NOT NULL DEFAULT 0;
