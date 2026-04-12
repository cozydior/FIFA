-- Allow Champions League club fixtures in the shared fixtures table (post–domestic season).

ALTER TABLE public.fixtures
  DROP CONSTRAINT IF EXISTS fixtures_competition_check;

ALTER TABLE public.fixtures
  ADD CONSTRAINT fixtures_competition_check
  CHECK (competition IN ('league', 'regional_cup', 'champions_league'));
