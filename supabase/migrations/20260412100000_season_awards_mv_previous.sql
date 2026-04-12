-- Manual end-of-season awards (Ballon d'Or ST, Palm d'Or GK)
-- Snapshot for market trend on rankings (updated when MV changes from sims)

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS market_value_previous numeric;

CREATE TABLE IF NOT EXISTS public.season_player_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_label text NOT NULL,
  award_type text NOT NULL CHECK (award_type IN ('ballon_dor', 'palm_dor')),
  player_id uuid NOT NULL REFERENCES public.players (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_label, award_type)
);

CREATE INDEX IF NOT EXISTS season_player_awards_season_idx
  ON public.season_player_awards (season_label);

ALTER TABLE public.season_player_awards ENABLE ROW LEVEL SECURITY;
