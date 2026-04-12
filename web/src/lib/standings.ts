/**
 * League table from completed fixtures (3-1-0 points).
 */

export type FixtureRow = {
  league_id: string | null;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
};

export type StandingRow = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

export type StandingsMode = "league" | "tournament";

export function computeStandings(
  teamIds: string[],
  fixtures: FixtureRow[],
  options?: {
    mode?: StandingsMode;
    teamSaves?: Record<string, number>;
  },
): StandingRow[] {
  type Row = {
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    points: number;
  };
  const table = new Map<string, Row>();
  for (const id of teamIds) {
    table.set(id, {
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      points: 0,
    });
  }

  for (const f of fixtures) {
    if (f.status !== "completed") continue;
    if (f.home_score == null || f.away_score == null) continue;
    const h = f.home_team_id;
    const a = f.away_team_id;
    if (!table.has(h) || !table.has(a)) continue;

    const hs = f.home_score;
    const as = f.away_score;
    const th = table.get(h)!;
    const ta = table.get(a)!;
    th.played += 1;
    ta.played += 1;
    th.gf += hs;
    th.ga += as;
    ta.gf += as;
    ta.ga += hs;

    if (hs > as) {
      th.won += 1;
      th.points += 3;
      ta.lost += 1;
    } else if (hs < as) {
      ta.won += 1;
      ta.points += 3;
      th.lost += 1;
    } else {
      th.drawn += 1;
      ta.drawn += 1;
      th.points += 1;
      ta.points += 1;
    }
  }

  const rows: StandingRow[] = teamIds.map((teamId) => {
    const r = table.get(teamId)!;
    return {
      teamId,
      played: r.played,
      won: r.won,
      drawn: r.drawn,
      lost: r.lost,
      goalsFor: r.gf,
      goalsAgainst: r.ga,
      points: r.points,
    };
  });

  const mode = options?.mode ?? "league";
  const saves = options?.teamSaves ?? {};

  rows.sort((x, y) => compareRows(x, y, fixtures, mode, saves));

  return rows;
}

function compareRows(
  a: StandingRow,
  b: StandingRow,
  fixtures: FixtureRow[],
  mode: StandingsMode,
  saves: Record<string, number>,
): number {
  // 1) points
  if (b.points !== a.points) return b.points - a.points;
  // 2) goals for
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

  if (mode === "league") {
    // 3) saves
    const svA = saves[a.teamId] ?? 0;
    const svB = saves[b.teamId] ?? 0;
    if (svB !== svA) return svB - svA;
    // 4) head-to-head
    const h2h = headToHeadCompare(a.teamId, b.teamId, fixtures);
    if (h2h !== 0) return h2h;
    // 5) "h2h vs 3rd team" approximation: mini-league aggregate among tied clubs
    const mini = miniLeagueCompare(a.teamId, b.teamId, fixtures);
    if (mini !== 0) return mini;
  } else {
    // tournament: 3) h2h, 4) saves, 5) mini-league
    const h2h = headToHeadCompare(a.teamId, b.teamId, fixtures);
    if (h2h !== 0) return h2h;
    const svA = saves[a.teamId] ?? 0;
    const svB = saves[b.teamId] ?? 0;
    if (svB !== svA) return svB - svA;
    const mini = miniLeagueCompare(a.teamId, b.teamId, fixtures);
    if (mini !== 0) return mini;
  }

  // 6) coin toss (stable deterministic fallback)
  return a.teamId.localeCompare(b.teamId);
}

function headToHeadCompare(
  teamA: string,
  teamB: string,
  fixtures: FixtureRow[],
): number {
  let ptsA = 0;
  let ptsB = 0;
  let gfA = 0;
  let gfB = 0;
  for (const f of fixtures) {
    if (f.status !== "completed" || f.home_score == null || f.away_score == null) continue;
    const ab =
      (f.home_team_id === teamA && f.away_team_id === teamB) ||
      (f.home_team_id === teamB && f.away_team_id === teamA);
    if (!ab) continue;
    const hs = f.home_score;
    const as = f.away_score;
    if (f.home_team_id === teamA) {
      gfA += hs;
      gfB += as;
      if (hs > as) ptsA += 3;
      else if (hs < as) ptsB += 3;
      else {
        ptsA += 1;
        ptsB += 1;
      }
    } else {
      gfA += as;
      gfB += hs;
      if (as > hs) ptsA += 3;
      else if (as < hs) ptsB += 3;
      else {
        ptsA += 1;
        ptsB += 1;
      }
    }
  }
  if (ptsB !== ptsA) return ptsB - ptsA;
  if (gfB !== gfA) return gfB - gfA;
  return 0;
}

function miniLeagueCompare(
  teamA: string,
  teamB: string,
  fixtures: FixtureRow[],
): number {
  // Approximation for "h2h vs 3rd team":
  // compare aggregate points+GF in all completed fixtures after primary tie.
  let aPts = 0;
  let bPts = 0;
  let aGf = 0;
  let bGf = 0;
  for (const f of fixtures) {
    if (f.status !== "completed" || f.home_score == null || f.away_score == null) continue;
    const hs = f.home_score;
    const as = f.away_score;
    if (f.home_team_id === teamA || f.away_team_id === teamA) {
      const isHome = f.home_team_id === teamA;
      const gf = isHome ? hs : as;
      const ga = isHome ? as : hs;
      aGf += gf;
      if (gf > ga) aPts += 3;
      else if (gf === ga) aPts += 1;
    }
    if (f.home_team_id === teamB || f.away_team_id === teamB) {
      const isHome = f.home_team_id === teamB;
      const gf = isHome ? hs : as;
      const ga = isHome ? as : hs;
      bGf += gf;
      if (gf > ga) bPts += 3;
      else if (gf === ga) bPts += 1;
    }
  }
  if (bPts !== aPts) return bPts - aPts;
  if (bGf !== aGf) return bGf - aGf;
  return 0;
}
