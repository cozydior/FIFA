-- (Superseded for honours: competition artwork is in app code — see competitionLogos.ts.)
-- If this migration already ran, 20260415140000_trophy_defs_clear_competition_brand_icons.sql clears these URLs.

UPDATE public.trophy_definitions
SET icon_url = 'https://upload.wikimedia.org/wikipedia/en/f/f5/UEFA_Champions_League.svg'
WHERE slug = 'champions_league';

UPDATE public.trophy_definitions
SET icon_url = 'https://upload.wikimedia.org/wikipedia/commons/b/b5/Concacaf_Gold_Cup_2021.svg'
WHERE slug = 'gold_cup';

UPDATE public.trophy_definitions
SET icon_url = 'https://upload.wikimedia.org/wikipedia/en/thumb/8/80/UEFA_Nations_League.svg/960px-UEFA_Nations_League.svg.png'
WHERE slug = 'nations_league';

UPDATE public.trophy_definitions
SET icon_url = 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e3/2022_FIFA_World_Cup.svg/1280px-2022_FIFA_World_Cup.svg.png'
WHERE slug = 'world_cup';
