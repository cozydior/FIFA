import type { SupabaseClient } from "@supabase/supabase-js";

const EPS = 1;

export type TeamBalanceDrift = {
  teamId: string;
  name: string;
  budget: number;
  sumTransactions: number;
  currentBalance: number;
  expectedBalance: number;
  /** `currentBalance - expectedBalance` (positive = books show more cash than ledger implies). */
  drift: number;
};

/**
 * Expected cash on hand = `teams.budget` (reference opening bankroll, not reduced by spending) +
 * sum of `team_transactions.amount`. Every automated movement uses {@link recordTeamTransaction},
 * which logs and adjusts `current_balance` together — so drift usually means a partial failure,
 * manual `current_balance` edit, or `budget` changed out of sync with reality.
 */
export async function computeTeamBalanceDrifts(
  supabase: SupabaseClient,
): Promise<TeamBalanceDrift[]> {
  const [{ data: teams, error: te }, { data: txs, error: txe }] = await Promise.all([
    supabase.from("teams").select("id, name, budget, current_balance").order("name"),
    supabase.from("team_transactions").select("team_id, amount"),
  ]);
  if (te) throw new Error(te.message);
  if (txe) throw new Error(txe.message);

  const sumByTeam = new Map<string, number>();
  for (const row of txs ?? []) {
    const tid = row.team_id as string;
    sumByTeam.set(tid, (sumByTeam.get(tid) ?? 0) + Number(row.amount ?? 0));
  }

  const out: TeamBalanceDrift[] = [];
  for (const tm of teams ?? []) {
    const budget = Number(tm.budget ?? 0);
    const sumTx = sumByTeam.get(tm.id as string) ?? 0;
    const current = Number(tm.current_balance ?? 0);
    const expected = budget + sumTx;
    const drift = current - expected;
    if (Math.abs(drift) >= EPS) {
      out.push({
        teamId: tm.id as string,
        name: String(tm.name ?? "Team"),
        budget,
        sumTransactions: sumTx,
        currentBalance: current,
        expectedBalance: expected,
        drift,
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
}

export async function applyTeamBalanceDrifts(
  supabase: SupabaseClient,
  drifts: TeamBalanceDrift[],
): Promise<number> {
  let n = 0;
  for (const d of drifts) {
    const { error } = await supabase
      .from("teams")
      .update({ current_balance: d.expectedBalance })
      .eq("id", d.teamId);
    if (error) throw new Error(error.message);
    n += 1;
  }
  return n;
}
