import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchClubSeasonSavesByTeamIds } from "@/lib/seasonEconomy";
import { computeStandings, type FixtureRow } from "@/lib/standings";

function rndScore(): number {
  return Math.floor(Math.random() * 4);
}

/** Mark every scheduled CL group fixture as completed with random scores. */
export async function fakeCompleteClGroupStage(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ completed: number }> {
  const { data: rows, error } = await supabase
    .from("fixtures")
    .select("id, cup_round")
    .eq("season_label", seasonLabel)
    .eq("competition", "champions_league")
    .eq("status", "scheduled")
    .like("cup_round", "CL_G%");
  if (error) throw new Error(error.message);
  let n = 0;
  for (const r of rows ?? []) {
    const hs = rndScore();
    const as = rndScore();
    const { error: u } = await supabase
      .from("fixtures")
      .update({ home_score: hs, away_score: as, status: "completed" })
      .eq("id", r.id);
    if (u) throw new Error(u.message);
    n += 1;
  }
  return { completed: n };
}

/**
 * Removes CL semi-final + final rows for the season, then re-seeds semis from completed group tables.
 * Use after bad week/pairing data. If the group stage is not fully complete, semis stay empty until it is, then run again.
 */
export async function refreshClSemisFromGroupTables(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ deleted: number; inserted: number }> {
  const { data: rows, error } = await supabase
    .from("fixtures")
    .select("id")
    .eq("season_label", seasonLabel)
    .eq("competition", "champions_league")
    .in("cup_round", ["CL_SF1", "CL_SF2", "CL_F"]);
  if (error) throw new Error(error.message);
  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length > 0) {
    const { error: delErr } = await supabase.from("fixtures").delete().in("id", ids);
    if (delErr) throw new Error(delErr.message);
  }
  const { inserted } = await insertClKnockoutsFromGroupTables(supabase, seasonLabel);
  return { deleted: ids.length, inserted };
}

/** After group stage is fully completed, insert SF + (optional) skip to F scheduling if SF already exist. */
export async function insertClKnockoutsFromGroupTables(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ inserted: number }> {
  const { data: existingSf } = await supabase
    .from("fixtures")
    .select("id")
    .eq("season_label", seasonLabel)
    .eq("competition", "champions_league")
    .like("cup_round", "CL_SF%")
    .limit(1);
  if ((existingSf ?? []).length > 0) return { inserted: 0 };

  const { data: allGroupFx, error: allErr } = await supabase
    .from("fixtures")
    .select(
      "league_id, home_team_id, away_team_id, home_score, away_score, status, week, cup_round",
    )
    .eq("season_label", seasonLabel)
    .eq("competition", "champions_league")
    .in("cup_round", ["CL_GA", "CL_GB"]);
  if (allErr) throw new Error(allErr.message);
  const gaAll = (allGroupFx ?? []).filter((f) => f.cup_round === "CL_GA");
  const gbAll = (allGroupFx ?? []).filter((f) => f.cup_round === "CL_GB");
  if (gaAll.length === 0 || gbAll.length === 0) return { inserted: 0 };
  /** Single round-robin × 2 groups = 3 ties each */
  if (gaAll.length !== 3 || gbAll.length !== 3) return { inserted: 0 };
  if ((allGroupFx ?? []).some((f) => f.status !== "completed")) return { inserted: 0 };

  const idsA = [...new Set(gaAll.flatMap((f) => [f.home_team_id, f.away_team_id]))];
  const idsB = [...new Set(gbAll.flatMap((f) => [f.home_team_id, f.away_team_id]))];
  const teamSaves = await fetchClubSeasonSavesByTeamIds(
    supabase,
    seasonLabel,
    [...idsA, ...idsB],
  );
  const tableA = computeStandings(idsA, gaAll as unknown as FixtureRow[], {
    mode: "league",
    teamSaves,
  });
  const tableB = computeStandings(idsB, gbAll as unknown as FixtureRow[], {
    mode: "league",
    teamSaves,
  });
  const topA = tableA.slice(0, 2).map((r) => r.teamId);
  const topB = tableB.slice(0, 2).map((r) => r.teamId);
  if (topA.length < 2 || topB.length < 2) return { inserted: 0 };

  const maxWeek = Math.max(0, ...(allGroupFx ?? []).map((f) => Number(f.week ?? 0)));
  /** First week after the latest scheduled group matchday (avoids SF same week as remaining group games). */
  const w = maxWeek + 1;
  const rows = [
    {
      season_label: seasonLabel,
      competition: "champions_league" as const,
      league_id: null as string | null,
      country: null as string | null,
      home_team_id: topA[0]!,
      away_team_id: topB[1]!,
      week: w,
      cup_round: "CL_SF1",
      leg: 1,
      status: "scheduled" as const,
      sort_order: 0,
    },
    {
      season_label: seasonLabel,
      competition: "champions_league" as const,
      league_id: null as string | null,
      country: null as string | null,
      home_team_id: topB[0]!,
      away_team_id: topA[1]!,
      week: w,
      cup_round: "CL_SF2",
      leg: 1,
      status: "scheduled" as const,
      sort_order: 1,
    },
  ];
  const { error: ins } = await supabase.from("fixtures").insert(rows);
  if (ins) throw new Error(ins.message);
  return { inserted: 2 };
}

export async function fakeCompleteClSemis(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ completed: number }> {
  const { data: rows, error } = await supabase
    .from("fixtures")
    .select("id")
    .eq("season_label", seasonLabel)
    .eq("competition", "champions_league")
    .eq("status", "scheduled")
    .like("cup_round", "CL_SF%");
  if (error) throw new Error(error.message);
  let n = 0;
  for (const r of rows ?? []) {
    const hs = rndScore();
    const as = rndScore();
    const { error: u } = await supabase
      .from("fixtures")
      .update({ home_score: hs, away_score: as, status: "completed" })
      .eq("id", r.id);
    if (u) throw new Error(u.message);
    n += 1;
  }
  return { completed: n };
}

export async function insertClFinalFromSemis(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ inserted: boolean }> {
  const { data: existingF } = await supabase
    .from("fixtures")
    .select("id")
    .eq("season_label", seasonLabel)
    .eq("competition", "champions_league")
    .eq("cup_round", "CL_F")
    .limit(1);
  if ((existingF ?? []).length > 0) return { inserted: false };

  const { data: sf } = await supabase
    .from("fixtures")
    .select(
      "home_team_id, away_team_id, home_score, away_score, status, week, cup_round",
    )
    .eq("season_label", seasonLabel)
    .eq("competition", "champions_league")
    .like("cup_round", "CL_SF%")
    .eq("status", "completed");
  if (!sf || sf.length < 2) return { inserted: false };

  const winners = sf.map((m) => {
    const hs = m.home_score ?? 0;
    const as = m.away_score ?? 0;
    return hs >= as ? m.home_team_id : m.away_team_id;
  });
  if (winners.length !== 2) return { inserted: false };

  const maxWeek = Math.max(0, ...sf.map((f) => Number(f.week ?? 0)));
  const { error } = await supabase.from("fixtures").insert({
    season_label: seasonLabel,
    competition: "champions_league",
    league_id: null,
    country: null,
    home_team_id: winners[0]!,
    away_team_id: winners[1]!,
    week: maxWeek + 1,
    cup_round: "CL_F",
    leg: 1,
    status: "scheduled",
    sort_order: 0,
  });
  if (error) throw new Error(error.message);
  return { inserted: true };
}

export async function fakeCompleteClFinal(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ completed: number }> {
  const { data: rows, error } = await supabase
    .from("fixtures")
    .select("id")
    .eq("season_label", seasonLabel)
    .eq("competition", "champions_league")
    .eq("status", "scheduled")
    .eq("cup_round", "CL_F");
  if (error) throw new Error(error.message);
  let n = 0;
  for (const r of rows ?? []) {
    let hs = rndScore();
    let as = rndScore();
    while (hs === as) {
      as = (as + 1) % 4;
    }
    const { error: u } = await supabase
      .from("fixtures")
      .update({ home_score: hs, away_score: as, status: "completed" })
      .eq("id", r.id);
    if (u) throw new Error(u.message);
    n += 1;
  }
  return { completed: n };
}
