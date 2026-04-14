-- Optional other club for transfer rows (seller on buys, buyer on sales); editable for legacy notes.
ALTER TABLE public.team_transactions
  ADD COLUMN IF NOT EXISTS counterparty_team_id uuid REFERENCES public.teams (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS team_transactions_counterparty_team_id_idx
  ON public.team_transactions (counterparty_team_id);
