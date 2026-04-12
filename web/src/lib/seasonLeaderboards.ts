import type { SupabaseClient } from "@supabase/supabase-js";

function asPlayerResults(raw: unknown): { id: string; goals?: number; saves?: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is { id: string; goals?: number; saves?: number } =>
      x != null && typeof x === "object" && typeof (x as { id?: string }).id === "string",
  );
}

type DomesticScope = {
  seasonLabel: string;
  competition?: string | null;
  leagueId?: string | null;
  cupCountry?: string | null;
};

/**
 * Full domestic totals from saved Matchday rows (before top-N slice).
 */
export async function aggregateDomesticSavedMatchGoalsSaves(
  supabase: SupabaseClient,
  args: DomesticScope,
): Promise<{ goals: Map<string, number>; saves: Map<string, number> }> {
  const { data: savedRows, error } = await supabase
    .from("saved_sim_matches")
    .select("player_results, fixture_id")
    .eq("season_label", args.seasonLabel)
    .not("fixture_id", "is", null);
  if (error) throw new Error(error.message);

  const fixtureIds = [...new Set((savedRows ?? []).map((r) => r.fixture_id).filter(Boolean))] as string[];
  const { data: fxRows } =
    fixtureIds.length === 0 ?
      {
        data: [] as {
          id: string;
          competition: string | null;
          league_id: string | null;
          country: string | null;
        }[],
      }
    : await supabase
        .from("fixtures")
        .select("id, competition, league_id, country")
        .in("id", fixtureIds);

  const fxMap = new Map((fxRows ?? []).map((f) => [f.id, f]));

  const goalsMap = new Map<string, number>();
  const savesMap = new Map<string, number>();

  for (const row of savedRows ?? []) {
    const fid = row.fixture_id as string | null;
    if (!fid) continue;
    const fx = fxMap.get(fid);
    if (!fx) continue;
    if (args.competition && (fx.competition ?? "") !== args.competition) continue;
    if (args.leagueId && fx.league_id !== args.leagueId) continue;
    if (
      args.competition === "regional_cup" &&
      args.cupCountry &&
      (fx.country ?? "") !== args.cupCountry
    ) {
      continue;
    }

    for (const p of asPlayerResults(row.player_results)) {
      const g = typeof p.goals === "number" ? p.goals : 0;
      const s = typeof p.saves === "number" ? p.saves : 0;
      if (g > 0) goalsMap.set(p.id, (goalsMap.get(p.id) ?? 0) + g);
      if (s > 0) savesMap.set(p.id, (savesMap.get(p.id) ?? 0) + s);
    }
  }

  return { goals: goalsMap, saves: savesMap };
}

async function aggregateIntlGoalsSavesForSeason(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ goals: Map<string, number>; saves: Map<string, number> }> {
  const { data, error } = await supabase
    .from("player_international_stats")
    .select("player_id, goals_for_country, saves_for_country")
    .eq("season_label", seasonLabel);
  if (error) throw new Error(error.message);
  const goals = new Map<string, number>();
  const saves = new Map<string, number>();
  for (const r of data ?? []) {
    const id = r.player_id as string;
    goals.set(id, (goals.get(id) ?? 0) + Number(r.goals_for_country ?? 0));
    saves.set(id, (saves.get(id) ?? 0) + Number(r.saves_for_country ?? 0));
  }
  return { goals, saves };
}

function isDomesticOnlyScope(args: DomesticScope): boolean {
  return !!(
    args.competition ||
    args.leagueId ||
    (args.competition === "regional_cup" && args.cupCountry)
  );
}

/**
 * Saved Matchday totals **plus** international tournament goals/saves for the same season label.
 * Use when showing an “all competitions” view. Scoped domestic-only queries skip the intl merge.
 */
export async function fetchSeasonCombinedSavedAndIntlLeaderboards(
  supabase: SupabaseClient,
  args: DomesticScope & { limit?: number },
): Promise<{
  topScorers: { playerId: string; goals: number }[];
  topSavers: { playerId: string; saves: number }[];
}> {
  const limit = args.limit ?? 15;
  if (isDomesticOnlyScope(args)) {
    return fetchSeasonSavedMatchLeaderboards(supabase, args);
  }

  const [{ goals: dg, saves: ds }, { goals: ig, saves: isv }] = await Promise.all([
    aggregateDomesticSavedMatchGoalsSaves(supabase, args),
    aggregateIntlGoalsSavesForSeason(supabase, args.seasonLabel),
  ]);

  const goals = new Map(dg);
  for (const [pid, v] of ig) goals.set(pid, (goals.get(pid) ?? 0) + v);
  const saves = new Map(ds);
  for (const [pid, v] of isv) saves.set(pid, (saves.get(pid) ?? 0) + v);

  const topScorers = [...goals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([playerId, goalsN]) => ({ playerId, goals: goalsN }));

  const topSavers = [...saves.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([playerId, savesN]) => ({ playerId, saves: savesN }));

  return { topScorers, topSavers };
}

/**
 * Aggregate goals / saves from saved Matchday rows joined to fixtures for competition scope.
 */
export async function fetchSeasonSavedMatchLeaderboards(
  supabase: SupabaseClient,
  args: DomesticScope & { limit?: number },
): Promise<{
  topScorers: { playerId: string; goals: number }[];
  topSavers: { playerId: string; saves: number }[];
}> {
  const limit = args.limit ?? 15;
  const { goals: goalsMap, saves: savesMap } = await aggregateDomesticSavedMatchGoalsSaves(
    supabase,
    args,
  );

  const topScorers = [...goalsMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([playerId, goals]) => ({ playerId, goals }));

  const topSavers = [...savesMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([playerId, saves]) => ({ playerId, saves }));

  return { topScorers, topSavers };
}
