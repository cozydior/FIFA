-- Crest/logo for international standings (optional; flags stay on nationality UI)
ALTER TABLE public.national_teams
  ADD COLUMN IF NOT EXISTS team_logo_url text;

-- Same JSON trophy cabinet shape as public.teams.trophies
ALTER TABLE public.national_teams
  ADD COLUMN IF NOT EXISTS trophies jsonb NOT NULL DEFAULT '[]'::jsonb;
