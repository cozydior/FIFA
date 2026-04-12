-- Rich score lines for knockouts (regulation vs extra-time) + replay metadata.

ALTER TABLE public.international_fixtures
  ADD COLUMN IF NOT EXISTS score_detail jsonb;

ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS score_detail jsonb;

ALTER TABLE public.saved_sim_matches
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb;
