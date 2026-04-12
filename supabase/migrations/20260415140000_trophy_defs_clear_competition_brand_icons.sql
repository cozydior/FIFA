-- Competition brand art lives in app code (competitionLogos.ts), not trophy cabinet icons.
-- Clear mistaken trophy_definitions URLs for these slugs so honours use generic/Admin-set icons only.

UPDATE public.trophy_definitions
SET icon_url = NULL
WHERE slug IN ('champions_league', 'gold_cup', 'nations_league', 'world_cup');
