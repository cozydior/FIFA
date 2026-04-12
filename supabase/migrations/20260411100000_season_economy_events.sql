-- Idempotent season-scoped economy flags (payouts run once per key)

CREATE TABLE public.season_economy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_label text NOT NULL,
  event_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_label, event_key)
);

CREATE INDEX season_economy_events_season_idx ON public.season_economy_events (season_label);

ALTER TABLE public.season_economy_events ENABLE ROW LEVEL SECURITY;
