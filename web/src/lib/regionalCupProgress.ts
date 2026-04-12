import type { SupabaseClient } from "@supabase/supabase-js";
import {
  insertClFinalFromSemis,
  insertClKnockoutsFromGroupTables,
} from "@/lib/championsLeaguePreview";

type CupFx = {
  id: string;
  week: number | null;
  sort_order: number | null;
  cup_round: string | null;
  country: string | null;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
};

function winnerOf(f: CupFx): string | null {
  if (f.status !== "completed" || f.home_score == null || f.away_score == null) return null;
  if (f.home_score === f.away_score) return null;
  return f.home_score > f.away_score ? f.home_team_id : f.away_team_id;
}

function sortCupFx(a: CupFx, b: CupFx): number {
  const sa = a.sort_order ?? 0;
  const sb = b.sort_order ?? 0;
  if (sa !== sb) return sa - sb;
  const wa = a.week ?? 0;
  const wb = b.week ?? 0;
  if (wa !== wb) return wa - wb;
  return a.id.localeCompare(b.id);
}

/**
 * After QF/SF results exist: insert SF (2 ties) or Final (1 tie) when missing.
 * Idempotent — safe to call after every domestic match or manually (refresh).
 */
export async function progressRegionalCupKnockouts(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ sfInserted: number; fInserted: number }> {
  const { data: rows, error } = await supabase
    .from("fixtures")
    .select(
      "id, week, sort_order, cup_round, country, home_team_id, away_team_id, home_score, away_score, status",
    )
    .eq("season_label", seasonLabel)
    .eq("competition", "regional_cup");

  if (error) throw new Error(error.message);
  const all = (rows ?? []) as CupFx[];

  const byCountry = new Map<string, CupFx[]>();
  for (const f of all) {
    const c = (f.country ?? "").trim();
    if (!c) continue;
    if (!byCountry.has(c)) byCountry.set(c, []);
    byCountry.get(c)!.push(f);
  }

  let sfInserted = 0;
  let fInserted = 0;

  for (const [country, list] of byCountry) {
    const qfs = list.filter((x) => x.cup_round === "QF").sort(sortCupFx);
    const sfs = list.filter((x) => x.cup_round === "SF");
    const finals = list.filter((x) => x.cup_round === "F");

    const maxWeek = Math.max(0, ...list.map((x) => Number(x.week ?? 0)));

    // --- Semis: need 4 completed QFs, no SF rows yet
    if (qfs.length === 4 && sfs.length === 0) {
      const w = qfs.map(winnerOf);
      if (w.some((x) => x == null)) continue;

      const w1 = w[0]!;
      const w2 = w[1]!;
      const w3 = w[2]!;
      const w4 = w[3]!;
      const wSf = maxWeek + 1;
      const baseOrder = Math.max(0, ...list.map((x) => x.sort_order ?? 0)) + 1;

      const { error: ins } = await supabase.from("fixtures").insert([
        {
          season_label: seasonLabel,
          competition: "regional_cup",
          league_id: null,
          country,
          home_team_id: w1,
          away_team_id: w2,
          week: wSf,
          cup_round: "SF",
          status: "scheduled",
          sort_order: baseOrder,
        },
        {
          season_label: seasonLabel,
          competition: "regional_cup",
          league_id: null,
          country,
          home_team_id: w3,
          away_team_id: w4,
          week: wSf,
          cup_round: "SF",
          status: "scheduled",
          sort_order: baseOrder + 1,
        },
      ]);
      if (ins) throw new Error(ins.message);
      sfInserted += 2;
      continue;
    }

    // --- Final: need 2 completed SFs, no F row
    if (sfs.length >= 2 && finals.length === 0) {
      const sfSorted = [...sfs].sort(sortCupFx);
      const two = sfSorted.slice(0, 2);
      if (two.some((x) => x.status !== "completed")) continue;
      const wf = two.map(winnerOf);
      if (wf.some((x) => x == null)) continue;

      const maxW = Math.max(maxWeek, ...two.map((x) => Number(x.week ?? 0)));
      const wF = maxW + 1;
      const baseOrder = Math.max(0, ...list.map((x) => x.sort_order ?? 0)) + 1;

      const { error: insF } = await supabase.from("fixtures").insert({
        season_label: seasonLabel,
        competition: "regional_cup",
        league_id: null,
        country,
        home_team_id: wf[0]!,
        away_team_id: wf[1]!,
        week: wF,
        cup_round: "F",
        status: "scheduled",
        sort_order: baseOrder,
      });
      if (insF) throw new Error(insF.message);
      fInserted += 1;
    }
  }

  return { sfInserted, fInserted };
}

/**
 * Run Champions League knockout inserts (group→SF, SF→F). Idempotent.
 */
export async function progressChampionsLeagueKnockouts(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ clSfInserted: number; clFinalInserted: boolean }> {
  const a = await insertClKnockoutsFromGroupTables(supabase, seasonLabel);
  const b = await insertClFinalFromSemis(supabase, seasonLabel);
  return { clSfInserted: a.inserted, clFinalInserted: b.inserted };
}
