import type { SupabaseClient } from "@supabase/supabase-js";
import { computeStandings, type FixtureRow } from "@/lib/standings";
import { parseTrophyList } from "@/lib/trophyCabinet";
import { cupNameForCountry, cupLogoForCountry } from "@/lib/countryCups";

export type TeamHonourRef = {
  id: string;
  name: string;
  logoUrl: string | null;
};

export type NationalHonourRef = {
  id: string;
  name: string;
  flag: string;
};

export type DomesticLeagueRoll = {
  leagueId: string;
  leagueName: string;
  division: string;
  leagueLogoUrl: string | null;
  rows: {
    seasonLabel: string;
    winner: TeamHonourRef;
    runnerUp: TeamHonourRef | null;
  }[];
};

/**
 * League tables from completed fixtures: 1st = champion, 2nd = runner-up.
 */
export async function fetchDomesticRollOfHonourForCountry(
  supabase: SupabaseClient,
  countryName: string,
): Promise<DomesticLeagueRoll[]> {
  const { data: leagues } = await supabase
    .from("leagues")
    .select("id, name, division, logo_url")
    .eq("country", countryName)
    .order("division");

  if (!leagues?.length) return [];

  const leagueIds = leagues.map((l) => l.id);

  const { data: fxRaw } = await supabase
    .from("fixtures")
    .select(
      "season_label, league_id, home_team_id, away_team_id, home_score, away_score, status",
    )
    .in("league_id", leagueIds)
    .eq("competition", "league");

  const { data: teamRows } = await supabase.from("teams").select("id, name, logo_url");
  const teamName = new Map((teamRows ?? []).map((t) => [t.id, t.name]));
  const teamLogo = new Map((teamRows ?? []).map((t) => [t.id, t.logo_url]));

  const byLeagueSeason = new Map<string, FixtureRow[]>();
  for (const f of fxRaw ?? []) {
    if (!f.league_id || !f.season_label) continue;
    const k = `${f.season_label}::${f.league_id}`;
    if (!byLeagueSeason.has(k)) byLeagueSeason.set(k, []);
    byLeagueSeason.get(k)!.push({
      league_id: f.league_id,
      home_team_id: f.home_team_id,
      away_team_id: f.away_team_id,
      home_score: f.home_score,
      away_score: f.away_score,
      status: f.status ?? "",
    });
  }

  const result: DomesticLeagueRoll[] = [];

  for (const L of leagues) {
    const rows: DomesticLeagueRoll["rows"] = [];
    const keys = [...byLeagueSeason.keys()].filter((k) => k.endsWith(`::${L.id}`));

    for (const k of keys.sort((a, b) => b.localeCompare(a))) {
      const fixtures = byLeagueSeason.get(k) ?? [];
      const seasonLabel = k.split("::")[0] ?? "";
      const teamIds = [
        ...new Set(
          fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]),
        ),
      ];
      if (teamIds.length === 0) continue;

      const st = computeStandings(teamIds, fixtures, { mode: "league" });
      const w = st[0];
      const r = st[1];
      if (!w) continue;
      rows.push({
        seasonLabel,
        winner: {
          id: w.teamId,
          name: teamName.get(w.teamId) ?? w.teamId,
          logoUrl: teamLogo.get(w.teamId) ?? null,
        },
        runnerUp:
          r ?
            {
              id: r.teamId,
              name: teamName.get(r.teamId) ?? r.teamId,
              logoUrl: teamLogo.get(r.teamId) ?? null,
            }
          : null,
      });
    }

    rows.sort((a, b) => b.seasonLabel.localeCompare(a.seasonLabel));
    result.push({
      leagueId: L.id,
      leagueName: L.name,
      division: L.division,
      leagueLogoUrl: L.logo_url ?? null,
      rows,
    });
  }

  return result;
}

export type DomesticCupRoll = {
  country: string;
  cupName: string;
  cupLogoUrl: string | null;
  rows: {
    seasonLabel: string;
    winner: TeamHonourRef;
    runnerUp: TeamHonourRef | null;
  }[];
};

/**
 * Regional cup finals: winner (home/away score) + runner-up per season for a country.
 * Always returns an object (with empty rows if no finals played yet) for known cup countries.
 */
export async function fetchDomesticCupRoll(
  supabase: SupabaseClient,
  countryName: string,
): Promise<DomesticCupRoll | null> {
  const cupName = cupNameForCountry(countryName);
  const cupLogoUrl = cupLogoForCountry(countryName);

  // Only show section for countries that have a configured cup
  if (!cupLogoUrl && cupName === `${countryName} Cup`) return null;

  const { data: fxRaw } = await supabase
    .from("fixtures")
    .select(
      "season_label, home_team_id, away_team_id, home_score, away_score, status",
    )
    .eq("competition", "regional_cup")
    .eq("cup_round", "F")
    .eq("status", "completed")
    .eq("country", countryName);

  if (!fxRaw?.length) {
    return { country: countryName, cupName, cupLogoUrl, rows: [] };
  }

  const { data: teamRows } = await supabase.from("teams").select("id, name, logo_url");
  const teamName = new Map((teamRows ?? []).map((t) => [t.id, t.name]));
  const teamLogo = new Map((teamRows ?? []).map((t) => [t.id, t.logo_url as string | null]));

  const bySeason = new Map<
    string,
    { winnerId: string; loserId: string }
  >();

  for (const f of fxRaw) {
    const sl = f.season_label ?? "";
    if (!sl) continue;
    const hs = Number(f.home_score);
    const as_ = Number(f.away_score);
    if (hs === as_) continue;
    const winnerId = hs > as_ ? (f.home_team_id as string) : (f.away_team_id as string);
    const loserId = hs > as_ ? (f.away_team_id as string) : (f.home_team_id as string);
    bySeason.set(sl, { winnerId, loserId });
  }

  const rows = [...bySeason.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([seasonLabel, { winnerId, loserId }]) => ({
      seasonLabel,
      winner: {
        id: winnerId,
        name: teamName.get(winnerId) ?? winnerId,
        logoUrl: teamLogo.get(winnerId) ?? null,
      },
      runnerUp: {
        id: loserId,
        name: teamName.get(loserId) ?? loserId,
        logoUrl: teamLogo.get(loserId) ?? null,
      },
    }));

  return { country: countryName, cupName, cupLogoUrl, rows };
}

/**
 * Completed finals only: winner + loser from scores.
 */
export async function fetchInternationalRollOfHonour(
  supabase: SupabaseClient,
  slug: "nations_league" | "gold_cup" | "world_cup",
): Promise<
  {
    seasonLabel: string;
    winner: NationalHonourRef;
    runnerUp: NationalHonourRef | null;
  }[]
> {
  const { data: comps } = await supabase
    .from("international_competitions")
    .select("id, season_label")
    .eq("slug", slug)
    .order("season_label", { ascending: false });

  const { data: ntRows } = await supabase
    .from("national_teams")
    .select("id, name, flag_emoji");
  const ntMap = new Map(
    (ntRows ?? []).map((t) => [
      t.id,
      { name: t.name, flag: (t.flag_emoji as string | null) ?? "🏳️" },
    ]),
  );

  const out: {
    seasonLabel: string;
    winner: NationalHonourRef;
    runnerUp: NationalHonourRef | null;
  }[] = [];

  for (const c of comps ?? []) {
    const { data: finals } = await supabase
      .from("international_fixtures")
      .select(
        "home_national_team_id, away_national_team_id, home_score, away_score, week, status, stage",
      )
      .eq("competition_id", c.id)
      .eq("stage", "F")
      .eq("status", "completed");

    const completed = (finals ?? []).filter(
      (f) => f.home_score != null && f.away_score != null,
    );
    if (completed.length === 0) continue;

    const final = [...completed].sort((a, b) => b.week - a.week)[0]!;
    const hs = Number(final.home_score);
    const as = Number(final.away_score);
    const homeW = hs > as;
    const wid = homeW ? final.home_national_team_id : final.away_national_team_id;
    const rid = homeW ? final.away_national_team_id : final.home_national_team_id;
    const wNt = ntMap.get(wid);
    const rNt = ntMap.get(rid);
    if (!wNt) continue;

    out.push({
      seasonLabel: c.season_label,
      winner: { id: wid, name: wNt.name, flag: wNt.flag },
      runnerUp:
        rNt ? { id: rid, name: rNt.name, flag: rNt.flag } : null,
    });
  }

  return out;
}

const CL_SLUG = "champions_league";

/** Deterministic winner when a knockout scoreline is level (e.g. preview/fake sim). */
export function tiebreakClubFixture(
  homeTeamId: string,
  awayTeamId: string,
  fixtureId: string,
): string {
  let h = 0;
  const s = `${homeTeamId}|${awayTeamId}|${fixtureId}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 2 === 0 ? homeTeamId : awayTeamId;
}

/**
 * Winner and runner-up from each completed Champions League final (`CL_F`) in fixtures.
 */
export async function fetchChampionsLeagueRollFromFixtures(
  supabase: SupabaseClient,
): Promise<
  { seasonLabel: string; winner: TeamHonourRef; runnerUp: TeamHonourRef | null }[]
> {
  const { data: fxRaw } = await supabase
    .from("fixtures")
    .select(
      "id, season_label, week, home_team_id, away_team_id, home_score, away_score, status, cup_round",
    )
    .eq("competition", CL_SLUG)
    .eq("cup_round", "CL_F")
    .eq("status", "completed");

  const { data: teamRows } = await supabase.from("teams").select("id, name, logo_url");
  const teamName = new Map((teamRows ?? []).map((t) => [t.id, t.name]));
  const teamLogo = new Map((teamRows ?? []).map((t) => [t.id, t.logo_url]));

  const bySeason = new Map<
    string,
    {
      week: number;
      fixtureId: string;
      home_team_id: string;
      away_team_id: string;
      home_score: number;
      away_score: number;
    }
  >();

  for (const f of fxRaw ?? []) {
    if (f.home_score == null || f.away_score == null) continue;
    const hs = Number(f.home_score);
    const as = Number(f.away_score);
    const seasonLabel = f.season_label ?? "";
    if (!seasonLabel) continue;
    const wk = f.week ?? 0;
    const prev = bySeason.get(seasonLabel);
    if (!prev || wk > prev.week) {
      bySeason.set(seasonLabel, {
        week: wk,
        fixtureId: f.id,
        home_team_id: f.home_team_id,
        away_team_id: f.away_team_id,
        home_score: hs,
        away_score: as,
      });
    }
  }

  const rows: { seasonLabel: string; winner: TeamHonourRef; runnerUp: TeamHonourRef | null }[] = [];

  for (const [seasonLabel, m] of bySeason) {
    let wid: string;
    let rid: string;
    if (m.home_score === m.away_score) {
      wid = tiebreakClubFixture(m.home_team_id, m.away_team_id, m.fixtureId);
      rid = wid === m.home_team_id ? m.away_team_id : m.home_team_id;
    } else {
      const homeW = m.home_score > m.away_score;
      wid = homeW ? m.home_team_id : m.away_team_id;
      rid = homeW ? m.away_team_id : m.home_team_id;
    }
    rows.push({
      seasonLabel,
      winner: {
        id: wid,
        name: teamName.get(wid) ?? wid,
        logoUrl: teamLogo.get(wid) ?? null,
      },
      runnerUp: {
        id: rid,
        name: teamName.get(rid) ?? rid,
        logoUrl: teamLogo.get(rid) ?? null,
      },
    });
  }

  rows.sort((a, b) => b.seasonLabel.localeCompare(a.seasonLabel));
  return rows;
}

/**
 * Winners from team trophy cabinets (manual / future automation). Runner-up not stored.
 */
export async function fetchChampionsLeagueRollFromTrophies(
  supabase: SupabaseClient,
): Promise<
  { seasonLabel: string; winner: TeamHonourRef; runnerUp: null }[]
> {
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, logo_url, trophies");

  const acc: { seasonLabel: string; winner: TeamHonourRef }[] = [];

  for (const t of teams ?? []) {
    for (const e of parseTrophyList(t.trophies)) {
      if (e.trophy_slug !== CL_SLUG) continue;
      const seasonLabel =
        typeof e.season === "string" && e.season.trim() ? e.season.trim() : null;
      if (!seasonLabel) continue;
      acc.push({
        seasonLabel,
        winner: {
          id: t.id,
          name: t.name,
          logoUrl: t.logo_url ?? null,
        },
      });
    }
  }

  acc.sort((a, b) => b.seasonLabel.localeCompare(a.seasonLabel));

  const seen = new Set<string>();
  const deduped: { seasonLabel: string; winner: TeamHonourRef; runnerUp: null }[] = [];
  for (const row of acc) {
    if (seen.has(row.seasonLabel)) continue;
    seen.add(row.seasonLabel);
    deduped.push({ ...row, runnerUp: null });
  }

  return deduped;
}
