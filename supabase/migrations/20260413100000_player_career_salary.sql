-- Cumulative salary attributed to each player when season wages run
-- (each season: 50% of that player's market value while on the club roster)

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS career_salary_earned numeric NOT NULL DEFAULT 0;
