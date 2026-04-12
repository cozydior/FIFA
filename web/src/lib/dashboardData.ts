import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { formatFixtureCalendarLabel } from "@/lib/calendarPhases";
import { countryCodeToFlagEmoji } from "@/lib/flags";
import { computeStandings, type FixtureRow } from "@/lib/standings";
import { buildSeasonMasterFromDatabase } from "@/lib/seasonMasterData";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import {
  clubCompetitionDisplay,
  clubFixtureWeekKind,
} from "@/lib/matchCompetitionDisplay";

export type DashboardUpcomingClub = {
  kind: "club";
  id: string;
  week: number;
  /** league | regional_cup | champions_league */
  competition: string;
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
  competitionLabel: string;
  /** e.g. Week 3 / CL W40 / Intl W200 */
  weekLabel: string;
  /** Domestic league logo when applicable */
  leagueLogoUrl: string | null;
  /** Host country flag for league / regional cup */
  countryFlagEmoji: string | null;
  /** Show Champions League brand asset in UI */
  useClBrand: boolean;
  /** League country for sorting (England / Spain / France / …) */
  leagueCountry: string;
  /** League division for sorting (D1 / D2 / …) */
  leagueDivision: string;
  /** Champions League: order group fixtures before knockouts within the same week */
  clRoundOrder?: number;
};

export type DashboardUpcomingInternational = {
  kind: "international";
  id: string;
  week: number;
  /** Human-readable week label (intl uses high calendar weeks). */
  weekLabel: string;
  homeNationalTeamId: string;
  awayNationalTeamId: string;
  homeName: string;
  awayName: string;
  homeFlag: string;
  awayFlag: string;
  homeCode: string | null;
  awayCode: string | null;
  competitionLabel: string;
  competitionSlug: string;
};

export type DashboardUpcoming = DashboardUpcomingClub | DashboardUpcomingInternational;

export async function getDashboardSummary(seasonOverride?: string) {
  const supabase = getSupabaseAdmin();
  const season = seasonOverride?.trim()
    ? seasonOverride.trim()
    : await getCurrentSeasonLabel();
  if (!season) {
    return {
      season: null,
      tables: [],
      upcoming: [] as DashboardUpcoming[],
      news: [],
      scheduleWarnings: ["No season selected. Create/set a current season in Admin."],
    };
  }

  const [{ data: leagues }, { data: teams }, { data: fixturesRaw }, { data: txs }, { data: countries }, { data: players }, { data: stats }] =
    await Promise.all([
      supabase
        .from("leagues")
        .select("id, name, country, division, logo_url")
        .order("country")
        .order("division"),
      supabase
        .from("teams")
        .select("id, name, league_id, logo_url")
        .order("name"),
      supabase
        .from("fixtures")
        .select(
          "id, league_id, home_team_id, away_team_id, home_score, away_score, status, week, season_label, competition, country, cup_round",
        )
        .eq("season_label", season)
        .order("week"),
      supabase
        .from("team_transactions")
        .select("id, amount, category, note, created_at, team_id")
        .order("created_at", { ascending: false })
        .limit(12),
      supabase.from("countries").select("name, flag_emoji, code"),
      supabase.from("players").select("id, team_id"),
      supabase.from("stats").select("player_id, season, saves").eq("season", season),
    ]);
  const flagByCountry = new Map(
    (countries ?? []).map((c) => {
      const raw = (c.flag_emoji as string | null)?.trim();
      const fallback = countryCodeToFlagEmoji(String(c.code ?? ""));
      return [c.name, raw || fallback || "🏳️"];
    }),
  );

  const leagueById = new Map(
    (leagues ?? []).map((L) => [
      L.id,
      {
        name: L.name,
        country: L.country,
        division: L.division,
        logo_url: L.logo_url ?? null,
      },
    ]),
  );

  const teamsByLeague = new Map<string, typeof teams>();
  for (const t of teams ?? []) {
    if (!t.league_id) continue;
    if (!teamsByLeague.has(t.league_id)) teamsByLeague.set(t.league_id, []);
    teamsByLeague.get(t.league_id)!.push(t);
  }

  const fixtures = (fixturesRaw ?? []) as FixtureRow[];
  const teamByPlayer = new Map((players ?? []).map((p) => [p.id, p.team_id]));
  const teamSaves: Record<string, number> = {};
  for (const s of stats ?? []) {
    const tid = teamByPlayer.get(s.player_id);
    if (!tid) continue;
    teamSaves[tid] = (teamSaves[tid] ?? 0) + Number(s.saves ?? 0);
  }

  const tables: {
    leagueId: string;
    leagueName: string;
    leagueLogoUrl: string | null;
    country: string;
    countryFlag: string | null;
    division: string;
    standings: {
      teamId: string;
      teamName: string;
      teamLogoUrl: string | null;
      points: number;
      played: number;
      won: number;
      drawn: number;
      lost: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDiff: number;
    }[];
  }[] = [];

  for (const L of leagues ?? []) {
    const lt = teamsByLeague.get(L.id) ?? [];
    if (lt.length === 0) continue;
    const teamIds = lt.map((t) => t.id);
    const leagueFixtures = fixtures.filter(
      (f) => f.league_id === L.id,
    ) as FixtureRow[];
    const st = computeStandings(teamIds, leagueFixtures, {
      mode: "league",
      teamSaves,
    });
    const nameById = new Map(lt.map((t) => [t.id, t.name]));
    tables.push({
      leagueId: L.id,
      leagueName: L.name,
      leagueLogoUrl: L.logo_url ?? null,
      country: L.country,
      countryFlag: (flagByCountry.get(L.country) as string | null) ?? null,
      division: L.division,
      standings: st.map((r) => ({
        teamId: r.teamId,
        teamName: nameById.get(r.teamId) ?? r.teamId,
        teamLogoUrl: lt.find((x) => x.id === r.teamId)?.logo_url ?? null,
        points: r.points,
        played: r.played,
        won: r.won,
        drawn: r.drawn,
        lost: r.lost,
        goalsFor: r.goalsFor,
        goalsAgainst: r.goalsAgainst,
        goalDiff: r.goalsFor - r.goalsAgainst,
      })),
    });
  }

  const COUNTRY_PRIORITY: Record<string, number> = { England: 0, Spain: 1, France: 2 };
  const DIVISION_PRIORITY: Record<string, number> = { D1: 0, D2: 1 };

  function clubSortKey(c: DashboardUpcomingClub): number {
    if (c.competition === "league") {
      const cp = COUNTRY_PRIORITY[c.leagueCountry] ?? 3;
      const dp = DIVISION_PRIORITY[c.leagueDivision] ?? 2;
      // Per week: England D1, D2 → Spain D1, D2 → France D1, D2
      return cp * 3 + dp;
    }
    if (c.competition === "regional_cup") return 20 + (COUNTRY_PRIORITY[c.leagueCountry] ?? 3);
    if (c.competition === "champions_league") return 30;
    return 40;
  }

  function championsLeagueRoundOrder(cupRound: string | null | undefined): number {
    const r = cupRound ?? "";
    if (r === "CL_GA") return 0;
    if (r === "CL_GB") return 1;
    if (r === "CL_SF1") return 2;
    if (r === "CL_SF2") return 3;
    if (r === "CL_F") return 4;
    return 50;
  }

  function includeScheduledClubFixture(f: {
    status: string;
    competition?: string | null;
    cup_round?: string | null;
  }): boolean {
    if (f.status !== "scheduled") return false;
    if ((f.competition ?? "") !== "champions_league") return true;
    const groupFx = (fixturesRaw ?? []).filter(
      (x) =>
        x.competition === "champions_league" &&
        (x.cup_round === "CL_GA" || x.cup_round === "CL_GB"),
    );
    if (groupFx.length === 0) return true;
    const groupsComplete = groupFx.every((x) => x.status === "completed");
    if (groupsComplete) return true;
    const r = f.cup_round ?? "";
    if (r === "CL_SF1" || r === "CL_SF2" || r === "CL_F") return false;
    return true;
  }

  const rawClub = (fixturesRaw ?? []).filter(includeScheduledClubFixture);
  const clubUpcoming: DashboardUpcomingClub[] = rawClub
    .map((f) => {
      const home = teams?.find((t) => t.id === f.home_team_id);
      const away = teams?.find((t) => t.id === f.away_team_id);
      const comp = f.competition ?? "league";
      const league = leagueById.get(f.league_id ?? "");
      const disp = clubCompetitionDisplay(
        {
          competition: f.competition,
          league_id: f.league_id,
          country: f.country,
          cup_round: f.cup_round,
        },
        leagueById,
        flagByCountry,
      );
      return {
        kind: "club" as const,
        id: f.id,
        week: f.week,
        competition: comp,
        homeTeamId: f.home_team_id,
        awayTeamId: f.away_team_id,
        homeName: home?.name ?? f.home_team_id,
        awayName: away?.name ?? f.away_team_id,
        competitionLabel: disp.competitionLabel,
        leagueLogoUrl: disp.leagueLogoUrl,
        countryFlagEmoji: disp.countryFlagEmoji,
        useClBrand: disp.useClBrand,
        weekLabel: formatFixtureCalendarLabel(f.week, clubFixtureWeekKind(comp)),
        leagueCountry: league?.country ?? f.country ?? "",
        leagueDivision: league?.division ?? "",
        clRoundOrder:
          comp === "champions_league" ? championsLeagueRoundOrder(f.cup_round) : undefined,
      };
    })
    .sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week;
      if (
        a.competition === "champions_league" &&
        b.competition === "champions_league" &&
        a.clRoundOrder != null &&
        b.clRoundOrder != null
      ) {
        const dr = a.clRoundOrder - b.clRoundOrder;
        if (dr !== 0) return dr;
        return a.id.localeCompare(b.id);
      }
      const ck = clubSortKey(a) - clubSortKey(b);
      if (ck !== 0) return ck;
      return a.id.localeCompare(b.id);
    });

  const { data: intlComps } = await supabase
    .from("international_competitions")
    .select("id, slug, name")
    .eq("season_label", season);

  let intlUpcoming: DashboardUpcomingInternational[] = [];
  const compIds = (intlComps ?? []).map((c) => c.id);
  const compById = new Map((intlComps ?? []).map((c) => [c.id, c]));

  if (compIds.length > 0) {
    const { data: intlAllForGate } = await supabase
      .from("international_fixtures")
      .select("competition_id, stage, status")
      .in("competition_id", compIds);

    function intlKnockoutsAllowed(competitionId: string): boolean {
      const rows = intlAllForGate?.filter((x) => x.competition_id === competitionId) ?? [];
      const groupFx = rows.filter((x) => x.stage === "group");
      if (groupFx.length === 0) return true;
      return groupFx.every((x) => x.status === "completed");
    }

    const { data: intlFx } = await supabase
      .from("international_fixtures")
      .select(
        "id, week, competition_id, stage, home_national_team_id, away_national_team_id, status",
      )
      .in("competition_id", compIds)
      .eq("status", "scheduled")
      .order("week");

    const ntIds = [
      ...new Set(
        (intlFx ?? []).flatMap((x) => [x.home_national_team_id, x.away_national_team_id]),
      ),
    ];
    const { data: ntRows } =
      ntIds.length > 0 ?
        await supabase
          .from("national_teams")
          .select("id, name, flag_emoji, countries(code, flag_emoji)")
          .in("id", ntIds)
      : { data: [] as Record<string, unknown>[] };

    const ntMeta = new Map(
      (ntRows ?? []).map((row: Record<string, unknown>) => {
        const c = row.countries as { code?: string; flag_emoji?: string | null } | { code?: string; flag_emoji?: string | null }[] | null | undefined;
        const country = Array.isArray(c) ? c[0] : c;
        const code =
          typeof country?.code === "string" ? country.code.toLowerCase() : null;
        const flag =
          (typeof country?.flag_emoji === "string" && country.flag_emoji.trim() ?
            country.flag_emoji
          : null) ??
          (typeof row.flag_emoji === "string" ? row.flag_emoji : null) ??
          "🏳️";
        return [
          row.id as string,
          {
            name: row.name as string,
            flag,
            code,
          },
        ];
      }),
    );

    intlUpcoming = (intlFx ?? [])
      .filter((f) => {
        const st = (f as { stage?: string }).stage;
        if (!st || st === "group") return true;
        return intlKnockoutsAllowed(f.competition_id);
      })
      .map((f) => {
        const comp = compById.get(f.competition_id);
        const slug = comp?.slug ?? "nations_league";
        const h = ntMeta.get(f.home_national_team_id);
        const a = ntMeta.get(f.away_national_team_id);
        const weekKind = slug === "world_cup" ? "world_cup" : "international";
        return {
          kind: "international" as const,
          id: f.id,
          week: f.week,
          weekLabel: formatFixtureCalendarLabel(f.week, weekKind),
          homeNationalTeamId: f.home_national_team_id,
          awayNationalTeamId: f.away_national_team_id,
          homeName: h?.name ?? f.home_national_team_id,
          awayName: a?.name ?? f.away_national_team_id,
          homeFlag: h?.flag ?? "🏳️",
          awayFlag: a?.flag ?? "🏳️",
          homeCode: h?.code ?? null,
          awayCode: a?.code ?? null,
          competitionLabel: comp?.name ?? "International",
          competitionSlug: comp?.slug ?? "nations_league",
        };
      });
  }

  // Club fixtures first (already sorted by league priority then week),
  // international fixtures appended after, sorted by week among themselves.
  const upcoming: DashboardUpcoming[] = [
    ...clubUpcoming,
    ...intlUpcoming.sort((a, b) => a.week - b.week || a.id.localeCompare(b.id)),
  ].slice(0, 40);

  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const news = (txs ?? []).map((row) => ({
    id: row.id,
    headline: `${teamName.get(row.team_id) ?? "Club"} — ${row.note ?? row.category}`,
    amount: row.amount,
    created_at: row.created_at,
  }));

  let scheduleWarnings: string[] = [];
  try {
    const sm = await buildSeasonMasterFromDatabase();
    scheduleWarnings = sm.warnings;
  } catch {
    /* optional */
  }

  return {
    season,
    tables,
    upcoming,
    news,
    scheduleWarnings,
  };
}
