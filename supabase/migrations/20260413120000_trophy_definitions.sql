-- Catalog of trophy / achievement types with icon URLs (set in Admin → Trophy library)

CREATE TABLE IF NOT EXISTS public.trophy_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  icon_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trophy_definitions_sort_idx ON public.trophy_definitions (sort_order, name);

INSERT INTO public.trophy_definitions (slug, name, sort_order) VALUES
  ('ballon_dor', 'Ballon d''Or', 1),
  ('palm_dor', 'Palm d''Or', 2),
  ('domestic_league', 'Domestic league title', 10),
  ('domestic_cup', 'Domestic / regional cup', 11),
  ('champions_league', 'Champions League', 20),
  ('nations_league', 'Nations League', 30),
  ('gold_cup', 'Gold Cup', 31),
  ('world_cup', 'World Cup', 40)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS trophies jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.trophy_definitions ENABLE ROW LEVEL SECURITY;
