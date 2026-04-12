-- Club snapshot for league stats: which team the player represented when domestic stats were recorded.
-- Updated on each league match save so history stays correct after transfers / free agency.

ALTER TABLE public.stats
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stats_team_id_idx ON public.stats (team_id);
