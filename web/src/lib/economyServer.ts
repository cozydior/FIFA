import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransactionCategory } from "@/lib/economy";

export async function recordTeamTransaction(
  supabase: SupabaseClient,
  params: {
    teamId: string;
    seasonLabel: string;
    amount: number;
    category: TransactionCategory;
    note?: string;
    /** Insert the log row even when amount is 0 (e.g. release, zero-fee events). */
    alwaysLog?: boolean;
    /** Other club (seller on buy, buyer on sale); optional. */
    counterparty_team_id?: string | null;
  },
): Promise<void> {
  if (params.amount === 0 && !params.alwaysLog) return;

  const row: Record<string, unknown> = {
    team_id: params.teamId,
    season_label: params.seasonLabel,
    amount: params.amount,
    category: params.category,
    note: params.note ?? null,
  };
  if (params.counterparty_team_id !== undefined) {
    row.counterparty_team_id = params.counterparty_team_id;
  }

  const { error } = await supabase.from("team_transactions").insert(row);
  if (error) throw new Error(error.message);

  if (params.amount !== 0) {
    const { data: team, error: te } = await supabase
      .from("teams")
      .select("current_balance")
      .eq("id", params.teamId)
      .single();
    if (te || !team) throw new Error(te?.message ?? "Team not found");

    const next = Number(team.current_balance) + params.amount;
    const { error: ue } = await supabase
      .from("teams")
      .update({ current_balance: next })
      .eq("id", params.teamId);
    if (ue) throw new Error(ue.message);
  }
}

/** Keeps `player_market_value_history` in sync with `players.market_value` for charts and YoY trends. */
export async function upsertPlayerMarketValueHistoryRow(
  supabase: SupabaseClient,
  playerId: string,
  seasonLabel: string,
  marketValue: number,
): Promise<void> {
  const { error } = await supabase.from("player_market_value_history").upsert(
    { player_id: playerId, season_label: seasonLabel, market_value: marketValue },
    { onConflict: "player_id,season_label" },
  );
  if (error) throw new Error(error.message);
}

/**
 * Charge 50% of squad MV once per season. Returns teams that could not afford (negative balance allowed = debt).
 * Teams with `last_wages_season` already equal to `seasonLabel` are skipped (idempotent) and counted in `skippedAlreadyPaid`.
 */
export async function applySeasonWages(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{
  results: { teamId: string; wages: number; newBalance: number }[];
  skippedAlreadyPaid: number;
  teamCount: number;
}> {
  const { data: teams, error: te } = await supabase
    .from("teams")
    .select("id, current_balance, last_wages_season");
  if (te) throw new Error(te.message);

  const list = teams ?? [];
  const results: { teamId: string; wages: number; newBalance: number }[] = [];
  let skippedAlreadyPaid = 0;

  for (const t of list) {
    if (t.last_wages_season === seasonLabel) {
      skippedAlreadyPaid += 1;
      continue;
    }

    const { data: players, error: pe } = await supabase
      .from("players")
      .select("id, market_value, career_salary_earned")
      .eq("team_id", t.id);
    if (pe) throw new Error(pe.message);

    const squadMv = (players ?? []).reduce(
      (s, p) => s + Number(p.market_value ?? 0),
      0,
    );
    const wages = Math.round(squadMv * 0.5);
    const balance = Number(t.current_balance);

    if (wages === 0) {
      await supabase
        .from("teams")
        .update({ last_wages_season: seasonLabel })
        .eq("id", t.id);
      results.push({ teamId: t.id, wages: 0, newBalance: balance });
      continue;
    }

    await recordTeamTransaction(supabase, {
      teamId: t.id,
      seasonLabel,
      amount: -wages,
      category: "wages",
      note: `Season wages (50% of squad MV £${squadMv.toLocaleString()})`,
    });

    // Attribute each player's salary share: 50% of their MV (sums to team wage bill).
    for (const p of players ?? []) {
      const share = Math.round(0.5 * Number(p.market_value ?? 0));
      if (share <= 0) continue;
      const prev = Number(p.career_salary_earned ?? 0);
      const { error: we } = await supabase
        .from("players")
        .update({ career_salary_earned: prev + share })
        .eq("id", p.id);
      if (we) throw new Error(we.message);
    }

    const { data: after } = await supabase
      .from("teams")
      .select("current_balance")
      .eq("id", t.id)
      .single();

    await supabase
      .from("teams")
      .update({ last_wages_season: seasonLabel })
      .eq("id", t.id);

    const nb = Number(after?.current_balance ?? balance - wages);
    results.push({
      teamId: t.id,
      wages,
      newBalance: nb,
    });
  }

  return { results, skippedAlreadyPaid, teamCount: list.length };
}
