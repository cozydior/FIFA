-- Explicit honours ordering on team/player pages (Admin → Trophy library per row).
ALTER TABLE public.trophy_definitions
  ADD COLUMN IF NOT EXISTS cabinet_scope text NOT NULL DEFAULT 'auto';

COMMENT ON COLUMN public.trophy_definitions.cabinet_scope IS
  'Honour sort bucket: auto = infer from slug/text; or eng/esp/fra/other × league D1/D2 / cup / champions_league.';
