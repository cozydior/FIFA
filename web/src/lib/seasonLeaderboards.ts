import type { SupabaseClient } from "@supabase/supabase-js";

function asPlayerResults(raw: unknown): { id: string; goals?: number; saves?: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is { id: string; goals?: number; saves?: number } =>
      x != null && typeof x === "object" && typeof (x as { id?: string }).id === "string",
  );
}

/**
 * Aggregate goals / saves from saved Matchday rows joined to fixtures for competition scope.
 */
export async function fetchSeasonSavedMatchLeaderboards(
  supabase: SupabaseClient,
  args: {
    seasonLabel: string;
    /** e.g. champions_league, regional_cup, league */
    competition?: string | null;
    /** Domestic league id when scoping a single league */
    leagueId?: string | null;
    /** For regional_cup — country name on the fixture (e.g. England) */
    cupCountry?: string | null;
    limit?: number;
  },
): Promise<{
  topScorers: { playerId: string; goals: number }[];
  topSavers: { playerId: string; saves: number }[];
}> {
  const limit = args.limit ?? 15;

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
