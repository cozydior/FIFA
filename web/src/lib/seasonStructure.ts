/**
 * Season structure: double round-robin (4 teams), regional cup QF, master calendar,
 * season-end promotion/relegation + Champions League qualification (pure logic).
 */

export interface SeasonTeamRef {
  id: string;
  name?: string;
}

export interface LeagueConfig {
  id: string;
  name: string;
  country: string;
  division: "D1" | "D2";
  teams: SeasonTeamRef[];
}

/** One league match — home/away fixed. */
export interface LeagueFixture {
  competition: "league";
  leagueId: string;
  leagueName: string;
  country: string;
  homeTeamId: string;
  awayTeamId: string;
  week: number;
  /** 0-based index within the double round-robin */
  matchIndex: number;
}

export interface RegionalCupQF {
  competition: "regional_cup";
  country: string;
  round: "QF";
  homeTeamId: string;
  awayTeamId: string;
  week: number;
  pairIndex: number;
}

/** Planned later rounds (teams filled after prior round is simulated). */
export interface RegionalCupPlaceholder {
  competition: "regional_cup";
  country: string;
  round: "SF" | "F";
  week: number;
  slot: number;
  label: string;
}

export type SeasonMasterRow =
  | LeagueFixture
  | RegionalCupQF
  | RegionalCupPlaceholder;

export interface LeagueStandingRow {
  teamId: string;
  position: number;
  leagueId: string;
  country: string;
  division: "D1" | "D2";
}

export interface LeagueMeta {
  id: string;
  country: string;
  division: "D1" | "D2";
}

export interface SeasonEndResult {
  /** All D1 1st- and 2nd-place teams across countries → one CL pool */
  championsLeagueTeamIds: string[];
  /** Per-team new `league_id` after 4th D1 ↔ 1st D2 swap (same country only) */
  teamLeagueUpdates: { teamId: string; newLeagueId: string }[];
  /** Descriptive rows for UI / inserting `tournament_entries` */
  championsLeagueQualifiers: {
    teamId: string;
    country: string;
    position: number;
  }[];
  relegationPromotion: {
    country: string;
    relegatedFromD1TeamId: string;
    promotedFromD2TeamId: string;
  }[];
}

/** Cup rounds land on these season weeks (after league weeks 2, 4, 6 complete). */
export const REGIONAL_CUP_QF_WEEK = 3;
export const REGIONAL_CUP_SF_WEEK = 5;
export const REGIONAL_CUP_FINAL_WEEK = 7;

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Exactly 4 teams: full double round-robin (12 matches, 6 per team).
 * Weeks 1–6 with 2 matches per week.
 */
export function generateDoubleRoundRobin(
  leagueId: string,
  leagueName: string,
  country: string,
  teamIds: string[],
): LeagueFixture[] {
  if (teamIds.length !== 4) {
    throw new Error(
      `League ${leagueName}: double round-robin requires exactly 4 teams, got ${teamIds.length}`,
    );
  }
  const [a, b, c, d] = teamIds;
  const firstRound: [string, string][] = [
    [a, b],
    [c, d],
    [a, c],
    [b, d],
    [a, d],
    [b, c],
  ];
  const returnLegs: [string, string][] = firstRound.map(([h, aw]) => [aw, h]);

  const pairs = [...firstRound, ...returnLegs];
  const out: LeagueFixture[] = [];
  pairs.forEach(([homeTeamId, awayTeamId], matchIndex) => {
    const week = Math.floor(matchIndex / 2) + 1;
    out.push({
      competition: "league",
      leagueId,
      leagueName,
      country,
      homeTeamId,
      awayTeamId,
      week,
      matchIndex,
    });
  });
  return out;
}

/**
 * Random QF: each D1 side plays one D2 side (random bijection).
 * D1 is home (arbitrary; swap if you prefer coin flip per tie).
 */
export function generateRegionalCupQuarterFinals(
  country: string,
  d1TeamIds: string[],
  d2TeamIds: string[],
  random: () => number = Math.random,
): Omit<RegionalCupQF, "week">[] {
  if (d1TeamIds.length !== 4 || d2TeamIds.length !== 4) {
    throw new Error(
      `Regional cup (${country}): need 4 D1 and 4 D2 teams for QF`,
    );
  }
  const s1 = shuffle([...d1TeamIds], random);
  const s2 = shuffle([...d2TeamIds], random);
  return s1.map((homeTeamId, pairIndex) => ({
    competition: "regional_cup" as const,
    country,
    round: "QF" as const,
    homeTeamId,
    awayTeamId: s2[pairIndex],
    pairIndex,
  }));
}

function cupPlaceholdersForCountry(country: string): RegionalCupPlaceholder[] {
  return [
    {
      competition: "regional_cup",
      country,
      round: "SF",
      week: REGIONAL_CUP_SF_WEEK,
      slot: 1,
      label: `${country} Cup — SF 1 (winners QF1 vs QF2)`,
    },
    {
      competition: "regional_cup",
      country,
      round: "SF",
      week: REGIONAL_CUP_SF_WEEK,
      slot: 2,
      label: `${country} Cup — SF 2 (winners QF3 vs QF4)`,
    },
    {
      competition: "regional_cup",
      country,
      round: "F",
      week: REGIONAL_CUP_FINAL_WEEK,
      slot: 1,
      label: `${country} Cup — Final`,
    },
  ];
}

/**
 * Builds league fixtures for every configured league + regional cups per country
 * (QF with real teams; SF/F as placeholders after W4 / W6).
 */
export function buildSeasonMasterSchedule(
  leagues: LeagueConfig[],
  options?: { random?: () => number },
): SeasonMasterRow[] {
  const random = options?.random ?? Math.random;
  const rows: SeasonMasterRow[] = [];

  const byCountryD1: Record<string, string[]> = {};
  const byCountryD2: Record<string, string[]> = {};

  for (const L of leagues) {
    const ids = L.teams.map((t) => t.id);
    if (ids.length !== 4) continue;
    rows.push(
      ...generateDoubleRoundRobin(L.id, L.name, L.country, ids),
    );
    if (L.division === "D1") {
      byCountryD1[L.country] = ids;
    } else if (L.division === "D2") {
      byCountryD2[L.country] = ids;
    }
  }

  const countries = new Set([
    ...Object.keys(byCountryD1),
    ...Object.keys(byCountryD2),
  ]);

  for (const country of countries) {
    const d1 = byCountryD1[country];
    const d2 = byCountryD2[country];
    if (!d1 || !d2) continue;
    const qfs = generateRegionalCupQuarterFinals(country, d1, d2, random);
    for (const qf of qfs) {
      rows.push({
        ...qf,
        week: REGIONAL_CUP_QF_WEEK,
      });
    }
    rows.push(...cupPlaceholdersForCountry(country));
  }

  return sortSeasonMasterRows(rows);
}

export function sortSeasonMasterRows(rows: SeasonMasterRow[]): SeasonMasterRow[] {
  return [...rows].sort((a, b) => {
    const wa = a.week;
    const wb = b.week;
    if (wa !== wb) return wa - wb;
    const ca =
      a.competition === "league"
        ? 0
        : a.round === "QF"
          ? 1
          : a.round === "SF"
            ? 2
            : 3;
    const cb =
      b.competition === "league"
        ? 0
        : b.round === "QF"
          ? 1
          : b.round === "SF"
            ? 2
            : 3;
    if (ca !== cb) return ca - cb;
    if (a.competition === "league" && b.competition === "league") {
      if (a.leagueId !== b.leagueId) return a.leagueId.localeCompare(b.leagueId);
      return a.matchIndex - b.matchIndex;
    }
    if (
      a.competition === "regional_cup" &&
      b.competition === "regional_cup" &&
      "pairIndex" in a &&
      "pairIndex" in b
    ) {
      return a.pairIndex - b.pairIndex;
    }
    if (
      a.competition === "regional_cup" &&
      a.round !== "QF" &&
      b.competition === "regional_cup" &&
      b.round !== "QF"
    ) {
      return a.slot - b.slot;
    }
    return 0;
  });
}

/**
 * Season end: top 2 each D1 league → Champions League list;
 * 4th place D1 ↔ 1st place D2 per country (swap `league_id`).
 */
export function applySeasonEnd(
  standings: LeagueStandingRow[],
  leagueMeta: LeagueMeta[],
): SeasonEndResult {
  const metaById = new Map(leagueMeta.map((m) => [m.id, m]));
  const byLeague = new Map<string, LeagueStandingRow[]>();

  for (const row of standings) {
    if (!byLeague.has(row.leagueId)) byLeague.set(row.leagueId, []);
    byLeague.get(row.leagueId)!.push(row);
  }
  for (const list of byLeague.values()) {
    list.sort((x, y) => x.position - y.position);
  }

  const byCountry = new Map<
    string,
    { d1?: LeagueMeta; d2?: LeagueMeta }
  >();

  for (const m of leagueMeta) {
    if (!byCountry.has(m.country)) byCountry.set(m.country, {});
    const bucket = byCountry.get(m.country)!;
    if (m.division === "D1") bucket.d1 = m;
    else bucket.d2 = m;
  }

  const championsLeagueQualifiers: SeasonEndResult["championsLeagueQualifiers"] =
    [];
  const teamLeagueUpdates: SeasonEndResult["teamLeagueUpdates"] = [];
  const relegationPromotion: SeasonEndResult["relegationPromotion"] = [];

  for (const [country, { d1, d2 }] of byCountry) {
    if (!d1 || !d2) continue;
    const d1Standings = byLeague.get(d1.id) ?? [];
    const d2Standings = byLeague.get(d2.id) ?? [];
    const top2 = d1Standings.filter((s) => s.position <= 2);
    for (const s of top2) {
      championsLeagueQualifiers.push({
        teamId: s.teamId,
        country,
        position: s.position,
      });
    }
    const fourth = d1Standings.find((s) => s.position === 4);
    const firstD2 = d2Standings.find((s) => s.position === 1);
    if (fourth && firstD2) {
      teamLeagueUpdates.push(
        { teamId: fourth.teamId, newLeagueId: d2.id },
        { teamId: firstD2.teamId, newLeagueId: d1.id },
      );
      relegationPromotion.push({
        country,
        relegatedFromD1TeamId: fourth.teamId,
        promotedFromD2TeamId: firstD2.teamId,
      });
    }
  }

  championsLeagueQualifiers.sort(
    (a, b) => a.country.localeCompare(b.country) || a.position - b.position,
  );

  return {
    championsLeagueTeamIds: championsLeagueQualifiers.map((q) => q.teamId),
    teamLeagueUpdates,
    championsLeagueQualifiers,
    relegationPromotion,
  };
}

/**
 * Labels for `tournament_entries.qualified_via` or UI.
 */
export function championsLeagueQualifiedVia(
  country: string,
  position: number,
): string {
  return `${country} D1 — ${position === 1 ? "1st" : "2nd"}`;
}
