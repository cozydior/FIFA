/**
 * Consistent ordering for domestic club fixtures on calendars:
 * week ascending, then league (England D1→D2, Spain…, France…) before regional cup, then Champions League.
 */

const COUNTRY_PRIORITY: Record<string, number> = { England: 0, Spain: 1, France: 2 };
const DIVISION_PRIORITY: Record<string, number> = { D1: 0, D2: 1 };

export type LeagueMetaForSort = { country: string; division: string };

export function clubScheduleSortKey(
  f: {
    competition?: string | null;
    league_id?: string | null;
    country?: string | null;
  },
  leagueById: Map<string, LeagueMetaForSort>,
): number {
  const comp = f.competition ?? "league";
  if (comp === "league") {
    const league = f.league_id ? leagueById.get(f.league_id) : undefined;
    const co = league?.country ?? f.country ?? "";
    const div = league?.division ?? "";
    const cp = COUNTRY_PRIORITY[co] ?? 3;
    const dp = DIVISION_PRIORITY[div] ?? 2;
    return cp * 3 + dp;
  }
  if (comp === "regional_cup") return 20 + (COUNTRY_PRIORITY[f.country ?? ""] ?? 3);
  if (comp === "champions_league") return 30;
  return 40;
}

export function championsLeagueRoundOrder(cupRound: string | null | undefined): number {
  const r = cupRound ?? "";
  if (r === "CL_GA") return 0;
  if (r === "CL_GB") return 1;
  if (r === "CL_SF1") return 2;
  if (r === "CL_SF2") return 3;
  if (r === "CL_F") return 4;
  return 50;
}

export function compareScheduledClubFixtures(
  a: {
    week: number;
    competition?: string | null;
    league_id?: string | null;
    country?: string | null;
    cup_round?: string | null;
    sort_order?: number | null;
    id: string;
  },
  b: typeof a,
  leagueById: Map<string, LeagueMetaForSort>,
): number {
  if (a.week !== b.week) return a.week - b.week;
  const compA = a.competition ?? "league";
  const compB = b.competition ?? "league";
  if (
    compA === "champions_league" &&
    compB === "champions_league"
  ) {
    const ra = championsLeagueRoundOrder(a.cup_round);
    const rb = championsLeagueRoundOrder(b.cup_round);
    const dr = ra - rb;
    if (dr !== 0) return dr;
    return a.id.localeCompare(b.id);
  }
  const ck = clubScheduleSortKey(a, leagueById) - clubScheduleSortKey(b, leagueById);
  if (ck !== 0) return ck;
  const sa = Number(a.sort_order ?? 0);
  const sb = Number(b.sort_order ?? 0);
  if (sa !== sb) return sa - sb;
  return a.id.localeCompare(b.id);
}
