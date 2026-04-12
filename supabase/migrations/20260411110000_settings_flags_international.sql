-- App settings + country flags + national teams (international layer)

-- Current season label etc.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Explicit flag emoji (don't try to derive England from ENG)
ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS flag_emoji text;

-- Seed flags for existing demo countries (safe to re-run)
UPDATE public.countries SET flag_emoji = '🏴' WHERE code = 'ENG' AND (flag_emoji IS NULL OR flag_emoji = '');
UPDATE public.countries SET flag_emoji = '🇪🇸' WHERE code = 'ESP' AND (flag_emoji IS NULL OR flag_emoji = '');
UPDATE public.countries SET flag_emoji = '🇫🇷' WHERE code = 'FRA' AND (flag_emoji IS NULL OR flag_emoji = '');

-- National teams are NOT leagues: separate entity keyed to a country
CREATE TABLE IF NOT EXISTS public.national_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES public.countries (id) ON DELETE CASCADE,
  name text NOT NULL,
  confederation text NOT NULL DEFAULT 'UEFA',
  flag_emoji text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_id)
);

CREATE INDEX IF NOT EXISTS national_teams_country_idx ON public.national_teams (country_id);
ALTER TABLE public.national_teams ENABLE ROW LEVEL SECURITY;

