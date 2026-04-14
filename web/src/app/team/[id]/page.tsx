import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  computeStandings,
  filterGhostZeroStandings,
  unionRosterAndFixtureTeamIds,
  type FixtureRow,
} from "@/lib/standings";

type LeagueFixture = FixtureRow & { season_label: string; league_id: string | null };
import {
  Check,
  ChevronDown,
  Minus,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { dashboardDomesticLeagueUrl } from "@/lib/dashboardLinks";
import {
  countSeasonsWithTrophySlug,
  definitionsBySlug,
  formatLeagueNameForDisplay,
  groupTrophyCabinetEntries,
  parseTrophyList,
  type TrophyDefinitionRow,
} from "@/lib/trophyCabinet";
import { TrophyTitleStars } from "@/components/TrophyTitleStars";
import { HonourCabinetChips } from "@/components/HonourCabinetCompact";
import { sortCabinetGroups } from "@/lib/honourDisplayOrder";
import { formatMoneyPounds } from "@/lib/formatMoney";
import { squadAnnualWageBill } from "@/lib/economy";
import { formatFixtureCalendarLabel } from "@/lib/calendarPhases";
import {
  clubCompetitionDisplay,
  clubFixtureWeekKind,
  savedSimFixtureDetailLine,
} from "@/lib/matchCompetitionDisplay";
import { CompetitionBrandLogo } from "@/components/CompetitionBrandLogo";
import { AetScoreLine } from "@/components/AetScoreLine";
import {
  parseBuyerClubNameFromSaleNote,
  parsePlayerNameFromTransferNote,
} from "@/lib/transferNotes";
import { txCategoryDisplay } from "@/lib/playerTransfers";
import { SeasonHistoryPager } from "@/components/SeasonHistoryPager";
import { marketTrendLabel } from "@/lib/fotMobBadge";
import { priorSeasonMvByPlayer } from "@/lib/mvSeasonTrend";
import { sortSavedSimMatchesAsc } from "@/lib/savedSimMatchSort";

export const revalidate = 60;

function SquadNationalityCell({
  nationality,
  code,
  flag,
}: {
  nationality: string;
  code: string | undefined;
  flag: string | null | undefined;
}) {
  const natInner = (
    <>
      {flag ?
        <span className="text-lg leading-none">{flag}</span>
      : <span>{nationality}</span>}
    </>
  );
  return code ?
      <Link
        href={`/countries/${code}`}
        className="inline-flex items-center gap-1 text-slate-600 hover:text-emerald-800 hover:underline"
        title={nationality}
        aria-label={nationality}
      >
        {natInner}
      </Link>
    : <span
        className="inline-flex items-center gap-1"
        title={nationality}
        aria-label={nationality}
      >
        {natInner}
      </span>;
}

function resultLetter(
  teamId: string,
  homeId: string,
  awayId: string,
  hs: number,
  as: number,
): "W" | "D" | "L" {
  const isHome = homeId === teamId;
  const gf = isHome ? hs : as;
  const ga = isHome ? as : hs;
  if (gf > ga) return "W";
  if (gf < ga) return "L";
  return "D";
}

function financeCategoryHeading(category: string): string {
  switch (category) {
    case "champions_league":
      return "Champions League";
    case "league":
      return "League";
    case "regional_cup":
      return "Domestic cup";
    case "promotion":
      return "Promotion";
    case "wages":
      return "Wages";
    case "match_fee":
      return "Match fee";
    default:
      return "Other";
  }
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: team, error } = await supabase
    .from("teams")
    .select(
      "id, name, logo_url, country, budget, current_balance, trophies, league_id, leagues(name, country, division, logo_url)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !team) notFound();

  const rawLeague = team.leagues as
    | { name: string; country: string; division: string; logo_url: string | null }
    | { name: string; country: string; division: string; logo_url: string | null }[]
    | null;
  const league = Array.isArray(rawLeague) ? rawLeague[0] ?? null : rawLeague;

  const { data: players } = await supabase
    .from("players")
    .select("id, name, role, nationality, market_value, profile_pic_url")
    .eq("team_id", id);

  const roleRank = (r: string) => (r === "ST" ? 0 : r === "GK" ? 1 : 2);
  const squadSorted = [...(players ?? [])].sort((a, b) => {
    const d = roleRank(a.role) - roleRank(b.role);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
  const strikers = squadSorted
    .filter((p) => p.role === "ST")
    .sort((a, b) => {
      const mv = Number(b.market_value ?? 0) - Number(a.market_value ?? 0);
      return mv !== 0 ? mv : a.name.localeCompare(b.name);
    });
  const goalkeepers = squadSorted.filter((p) => p.role === "GK");

  const { data: countryRows } = await supabase
    .from("countries")
    .select("name, flag_emoji, code");
  const flagByCountryForDisplay = new Map<string, string>(
    (countryRows ?? []).map((c) => [
      c.name,
      String((c.flag_emoji as string | null)?.trim() || "🏳️"),
    ]),
  );
  const flagByNationality = new Map(
    (countryRows ?? []).map((c) => [c.name, c.flag_emoji as string | null]),
  );
  const codeByNationality = new Map(
    (countryRows ?? []).map((c) => [
      c.name,
      String(c.code ?? "").toLowerCase(),
    ]),
  );

  const { data: trophyDefs } = await supabase
    .from("trophy_definitions")
    .select("id, slug, name, icon_url, sort_order");
  const defMap = definitionsBySlug(
    (trophyDefs ?? []) as TrophyDefinitionRow[],
  );
  const trophies = sortCabinetGroups(
    groupTrophyCabinetEntries(parseTrophyList(team.trophies), defMap),
    "team",
    defMap,
  );
  const championsLeagueStars = countSeasonsWithTrophySlug(
    team.trophies,
    "champions_league",
    defMap,
  );

  const savedRes = await supabase
    .from("saved_sim_matches")
    .select(
      "id, home_score, away_score, season_label, created_at, home_team_id, away_team_id, fixture_id, score_breakdown",
    )
    .or(`home_team_id.eq.${id},away_team_id.eq.${id}`)
    .order("created_at", { ascending: false })
    .limit(15);
  const savedMatchRows = savedRes.error ? [] : (savedRes.data ?? []);

  const savedOppIds = [
    ...new Set(
      (savedMatchRows ?? []).flatMap((m) =>
        m.home_team_id === id ? [m.away_team_id] : [m.home_team_id],
      ),
    ),
  ];
  const { data: oppNameRows } =
    savedOppIds.length > 0 ?
      await supabase.from("teams").select("id, name, logo_url").in("id", savedOppIds)
    : { data: [] as { id: string; name: string; logo_url: string | null }[] };
  const oppById = new Map(
    (oppNameRows ?? []).map((t) => [t.id, { name: t.name, logo_url: t.logo_url }]),
  );

  const squad = squadSorted;
  const totalSquadValue = squad.reduce(
    (sum, p) => sum + Number(p.market_value ?? 0),
    0,
  );

  const { data: transferTx } = await supabase
    .from("team_transactions")
    .select("id, amount, category, note, created_at, season_label")
    .eq("team_id", id)
    .in("category", ["transfer_in", "transfer_out", "release", "free_agent_pickup"])
    .order("created_at", { ascending: false })
    .limit(60);

  const { data: financeTx } = await supabase
    .from("team_transactions")
    .select("id, amount, category, note, created_at, season_label")
    .eq("team_id", id)
    .in("category", [
      "champions_league",
      "league",
      "regional_cup",
      "promotion",
      "wages",
      "match_fee",
      "other",
    ])
    .order("created_at", { ascending: false })
    .limit(120);

  const { data: allTeamsLookup } = await supabase
    .from("teams")
    .select("id, name, logo_url");
  const teamByLowerName = new Map(
    (allTeamsLookup ?? []).map((t) => [t.name.trim().toLowerCase(), t]),
  );

  const transferPlayerNames = [
    ...new Set(
      (transferTx ?? [])
        .map((tx) => parsePlayerNameFromTransferNote(tx.note))
        .filter((n): n is string => Boolean(n)),
    ),
  ];
  const { data: transferPlayers } =
    transferPlayerNames.length > 0 ?
      await supabase.from("players").select("id, name, profile_pic_url").in("name", transferPlayerNames)
    : { data: [] as { id: string; name: string; profile_pic_url: string | null }[] };
  const playerIdByName = new Map((transferPlayers ?? []).map((p) => [p.name, p.id]));
  const playerPicByName = new Map((transferPlayers ?? []).map((p) => [p.name, p.profile_pic_url]));

  const { data: upcomingFx } = await supabase
    .from("fixtures")
    .select(
      "id, week, season_label, home_team_id, away_team_id, competition, status, league_id, country, cup_round",
    )
    .or(`home_team_id.eq.${id},away_team_id.eq.${id}`)
    .eq("status", "scheduled")
    .order("week", { ascending: true })
    .limit(20);
  const { data: leaguesAll } = await supabase
    .from("leagues")
    .select("id, name, country, division, logo_url");
  const leagueByIdForUp = new Map(
    (leaguesAll ?? []).map((L) => [
      L.id,
      {
        name: L.name,
        country: L.country,
        division: L.division,
        logo_url: L.logo_url ?? null,
      },
    ]),
  );

  const savedSimFixtureIds = [
    ...new Set(
      (savedMatchRows ?? [])
        .map((m) => m.fixture_id)
        .filter((fid): fid is string => typeof fid === "string" && fid.length > 0),
    ),
  ];
  const { data: savedSimFixturesRaw } =
    savedSimFixtureIds.length > 0 ?
      await supabase
        .from("fixtures")
        .select(
          "id, competition, league_id, country, cup_round, week, season_label, sort_order",
        )
        .in("id", savedSimFixtureIds)
    : { data: [] as { id: string; competition: string | null; league_id: string | null; country: string | null; cup_round: string | null; week: number | null; season_label: string | null; sort_order: number | null }[] };
  const savedSimFixtureById = new Map(
    (savedSimFixturesRaw ?? []).map((f) => [f.id, f]),
  );

  const savedMatchRowsChronological = sortSavedSimMatchesAsc(
    savedMatchRows,
    savedSimFixtureById,
  );
  /** Newest fixture first for the browse list; form strip still uses chronological asc. */
  const savedMatchRowsNewestFirst = [...savedMatchRowsChronological].reverse();

  const upTeamIds = [
    ...new Set((upcomingFx ?? []).flatMap((f) => [f.home_team_id, f.away_team_id])),
  ];
  const { data: upTeamRows } =
    upTeamIds.length > 0 ?
      await supabase.from("teams").select("id, name, logo_url").in("id", upTeamIds)
    : { data: [] as { id: string; name: string; logo_url: string | null }[] };
  const upTeamMap = new Map((upTeamRows ?? []).map((t) => [t.id, t]));

  const { data: myFixtures } = await supabase
    .from("fixtures")
    .select(
      "id, league_id, season_label, home_team_id, away_team_id, home_score, away_score, status, competition, week, cup_round, country",
    )
    .or(`home_team_id.eq.${id},away_team_id.eq.${id}`)
    .eq("status", "completed");

  const seasonsInvolved = [
    ...new Set((myFixtures ?? []).map((f) => f.season_label)),
  ].filter(Boolean);
  const { data: leagueFixturesAll } =
    seasonsInvolved.length > 0
      ? await supabase
          .from("fixtures")
          .select(
            "league_id, season_label, home_team_id, away_team_id, home_score, away_score, status, competition",
          )
          .in("season_label", seasonsInvolved)
          .eq("competition", "league")
          .eq("status", "completed")
      : { data: [] as LeagueFixture[] };

  const { data: leagueRows } = await supabase
    .from("leagues")
    .select("id, name, country, division, logo_url");

  const leagueMeta = new Map((leagueRows ?? []).map((l) => [l.id, l]));
  const { data: allClubTeams } = await supabase
    .from("teams")
    .select("id, league_id");

  const teamsByLeague = new Map<string, string[]>();
  for (const t of allClubTeams ?? []) {
    if (!t.league_id) continue;
    if (!teamsByLeague.has(t.league_id)) teamsByLeague.set(t.league_id, []);
    teamsByLeague.get(t.league_id)!.push(t.id);
  }

  // Cup round progression helpers
  const CUP_ROUND_ORDER: Record<string, number> = { R3: 1, R4: 1, R5: 1, QF: 2, SF: 3, F: 4 };
  const CL_ROUND_ORDER: Record<string, number> = {
    CL_GA: 1, CL_GB: 1, CL_SF1: 2, CL_SF2: 2, CL_F: 3,
  };

  function bestCupRound(fixtures: typeof myFixtures, season: string, competition: string) {
    const games = (fixtures ?? []).filter(
      (f) => f.competition === competition && f.season_label === season,
    );
    let bestRank = 0;
    let bestRound: string | null = null;
    let won = false;
    for (const f of games) {
      const r = f.cup_round as string | null;
      if (!r) continue;
      const order = competition === "champions_league" ? CL_ROUND_ORDER : CUP_ROUND_ORDER;
      const rank = order[r] ?? 0;
      if (rank > bestRank) {
        bestRank = rank;
        bestRound = r;
        const finalCode = competition === "champions_league" ? "CL_F" : "F";
        if (r === finalCode) {
          const isHome = f.home_team_id === id;
          const gf = isHome ? (f.home_score ?? 0) : (f.away_score ?? 0);
          const ga = isHome ? (f.away_score ?? 0) : (f.home_score ?? 0);
          won = gf > ga;
        } else {
          won = false;
        }
      }
    }
    return { round: bestRound, won };
  }

  type SeasonRow = {
    season: string;
    leagueName: string;
    division: string;
    leagueLogoUrl: string | null;
    country: string;
    pos: number;
    pts: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    cupRound: string | null;
    cupWon: boolean;
    clRound: string | null;
    clWon: boolean;
  };
  const seasonHistory: SeasonRow[] = [];

  const pairKeys = new Map<string, { season: string; leagueId: string }>();
  for (const f of myFixtures ?? []) {
    if (f.competition !== "league" || !f.league_id) continue;
    const k = `${f.season_label}::${f.league_id}`;
    if (!pairKeys.has(k)) {
      pairKeys.set(k, { season: f.season_label, leagueId: f.league_id });
    }
  }

  for (const { season, leagueId } of pairKeys.values()) {
    const rosterIds = teamsByLeague.get(leagueId) ?? [];
    const fx = (leagueFixturesAll ?? []).filter(
      (f) => f.season_label === season && f.league_id === leagueId,
    ) as LeagueFixture[];
    if (fx.length === 0) continue;
    const teamIds = unionRosterAndFixtureTeamIds(rosterIds, fx as FixtureRow[]);
    if (teamIds.length === 0) continue;
    const st = filterGhostZeroStandings(computeStandings(teamIds, fx, { mode: "league" }));
    const idx = st.findIndex((r) => r.teamId === id);
    if (idx < 0) continue;
    const row = st[idx]!;
    const L = leagueMeta.get(leagueId);
    const { round: cupRound, won: cupWon } = bestCupRound(myFixtures, season, "regional_cup");
    const { round: clRound, won: clWon } = bestCupRound(myFixtures, season, "champions_league");
    seasonHistory.push({
      season,
      leagueName: L?.name ?? "League",
      division: L?.division ?? "",
      leagueLogoUrl: (L as { logo_url?: string | null } | undefined)?.logo_url ?? null,
      country: L?.country ?? "",
      pos: idx + 1,
      pts: row.points,
      played: row.played,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
      cupRound,
      cupWon,
      clRound,
      clWon,
    });
  }

  seasonHistory.sort((a, b) => b.season.localeCompare(a.season));

  const currentSeason = await getCurrentSeasonLabel();

  const playerIds = (players ?? []).map((p) => p.id);
  const { data: squadStats } =
    playerIds.length > 0 && currentSeason ?
      await supabase
        .from("stats")
        .select("player_id, goals, saves")
        .in("player_id", playerIds)
        .eq("season", currentSeason)
    : { data: [] as { player_id: string; goals: number | null; saves: number | null }[] };
  const statsByPlayerId = new Map(
    (squadStats ?? []).map((s) => [s.player_id, s]),
  );

  const { data: squadMvHist } =
    playerIds.length > 0 && currentSeason ?
      await supabase
        .from("player_market_value_history")
        .select("player_id, season_label, market_value")
        .in("player_id", playerIds)
    : { data: [] as { player_id: string; season_label: string; market_value: number }[] };
  const mvPriorSeasonByPlayer = priorSeasonMvByPlayer(
    (squadMvHist ?? []).map((r) => ({
      player_id: r.player_id as string,
      season_label: r.season_label as string,
      market_value: Number(r.market_value),
    })),
    currentSeason,
  );

  const leagueDashUrl =
    currentSeason && league ?
      dashboardDomesticLeagueUrl(currentSeason, league.country)
    : null;
  const leagueCountryCode =
    league ? codeByNationality.get(league.country) : undefined;

  // Last 5 by calendar (fixture week / season), oldest→newest for left-to-right chips
  const formLast = [...savedMatchRowsChronological]
    .filter((m) => m.home_score != null && m.away_score != null)
    .slice(-5);

  const balance = Number(team.current_balance ?? 0);
  const annualContracts = squadAnnualWageBill(totalSquadValue);
  const canCoverWageBill = balance >= annualContracts;

  const { data: allTeamRows } = await supabase.from("teams").select("id, league_id, country");
  const { data: allPlayerRows } = await supabase.from("players").select("team_id, market_value");
  const squadMvByTeam = new Map<string, number>();
  for (const t of allTeamRows ?? []) squadMvByTeam.set(t.id, 0);
  for (const p of allPlayerRows ?? []) {
    const tid = p.team_id as string | null;
    if (!tid || !squadMvByTeam.has(tid)) continue;
    squadMvByTeam.set(tid, (squadMvByTeam.get(tid) ?? 0) + Number(p.market_value ?? 0));
  }
  const mySquadMv = squadMvByTeam.get(id) ?? totalSquadValue;
  function squadRankAmong(teamIds: string[]): number | null {
    const ids = [...new Set(teamIds)].filter((tid) => squadMvByTeam.has(tid));
    if (ids.length === 0) return null;
    const strictlyGreater = ids.filter((tid) => (squadMvByTeam.get(tid) ?? 0) > mySquadMv).length;
    return strictlyGreater + 1;
  }
  const leaguePeerIds =
    team.league_id ?
      (allTeamRows ?? []).filter((t) => t.league_id === team.league_id).map((t) => t.id)
    : [];
  const countryPeerIds = (allTeamRows ?? [])
    .filter((t) => t.country === team.country)
    .map((t) => t.id);
  const globalPeerIds = (allTeamRows ?? []).map((t) => t.id);
  const squadRankLeague = team.league_id ? squadRankAmong(leaguePeerIds) : null;
  const squadRankCountry = squadRankAmong(countryPeerIds);
  const squadRankGlobal = squadRankAmong(globalPeerIds);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f1f5f9_0%,#f8fafc_12rem,#f1f5f9_100%)]">
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <header className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
          {team.logo_url ?
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={team.logo_url}
              alt=""
              className="mx-auto h-28 w-28 shrink-0 rounded-2xl border border-slate-200/90 object-contain shadow-md ring-1 ring-slate-200/60 sm:mx-0 sm:h-32 sm:w-32"
              decoding="async"
            />
          : <div className="mx-auto flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-200/80 text-3xl font-black text-slate-600 shadow-inner sm:mx-0 sm:h-32 sm:w-32">
              {team.name.slice(0, 1)}
            </div>
          }
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-emerald-700/90">
              Club
            </p>
            <h1 className="mt-1 flex flex-wrap items-center justify-center gap-x-1 text-3xl font-extrabold tracking-tight text-slate-900 sm:justify-start sm:text-4xl">
              <span>{team.name}</span>
              <TrophyTitleStars count={championsLeagueStars} label="Champions League titles" />
            </h1>
            {league && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
                {league.logo_url ?
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={league.logo_url}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-lg border border-slate-200/80 bg-white object-contain p-0.5 shadow-sm"
                  />
                : null}
                {leagueDashUrl ?
                  <Link
                    href={leagueDashUrl}
                    className="font-semibold text-emerald-900 hover:underline"
                  >
                    {formatLeagueNameForDisplay(league.name)}
                  </Link>
                : leagueCountryCode ?
                  <Link
                    href={`/countries/${leagueCountryCode}`}
                    className="font-semibold text-slate-800 hover:text-emerald-800 hover:underline"
                  >
                    {formatLeagueNameForDisplay(league.name)}
                  </Link>
                : <span className="font-semibold text-slate-800">
                    {formatLeagueNameForDisplay(league.name)}
                  </span>}
                {" "}
                ·{" "}
                {leagueCountryCode ?
                  <Link
                    href={`/countries/${leagueCountryCode}`}
                    className="font-semibold text-slate-800 hover:text-emerald-800 hover:underline"
                  >
                    {league.country}
                  </Link>
                : <span>{league.country}</span>}
                {" "}
                · {league.division}
              </p>
            )}
            <p className="mt-4 inline-flex rounded-2xl bg-sky-50 px-4 py-2 font-mono text-lg font-bold text-sky-950 ring-1 ring-sky-200/80">
              Club balance {formatMoneyPounds(balance)}
            </p>
          </div>
          </div>
        </header>

        <section className="mt-8">
        <div className="mb-6 grid gap-3 xl:grid-cols-2 xl:items-stretch">
          <div className="rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-sm xl:col-start-1 xl:row-start-1">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-0">
              <div className="min-w-0 sm:pr-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Squad value</p>
                <p className="mt-1 text-xl font-black text-slate-900">{formatMoneyPounds(totalSquadValue)}</p>
                <ul className="mt-2 space-y-0.5 font-mono text-[0.65rem] font-semibold tabular-nums text-slate-500">
                  {squadRankLeague != null ?
                    <li>
                      <span className="text-slate-400">League</span>{" "}
                      <span className="text-slate-700">#{squadRankLeague}</span>
                    </li>
                  : null}
                  {squadRankCountry != null ?
                    <li>
                      <span className="text-slate-400">Country</span>{" "}
                      <span className="text-slate-700">#{squadRankCountry}</span>
                    </li>
                  : null}
                  {squadRankGlobal != null ?
                    <li>
                      <span className="text-slate-400">Global</span>{" "}
                      <span className="text-slate-700">#{squadRankGlobal}</span>
                    </li>
                  : null}
                </ul>
              </div>
              <div
                className={`min-w-0 border-t border-slate-200 pt-4 sm:border-t-0 sm:pt-0 sm:pl-4 ${
                  canCoverWageBill
                    ? "max-sm:rounded-xl max-sm:border max-sm:border-emerald-300 max-sm:bg-emerald-50 max-sm:p-3 sm:rounded-xl sm:bg-emerald-50 sm:ring-1 sm:ring-emerald-200/80"
                    : "max-sm:rounded-xl max-sm:border max-sm:border-red-300 max-sm:bg-red-50 max-sm:p-3 sm:rounded-xl sm:bg-red-50 sm:ring-1 sm:ring-red-200/80"
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Contracts</p>
                <p className="mt-1 text-xl font-black text-slate-900">{formatMoneyPounds(annualContracts)}</p>
                <p className="mt-1 text-[0.65rem] leading-snug text-slate-600">
                  Annual wage bill (50% of squad MV). {canCoverWageBill ? "Balance covers it." : "Balance below this bill."}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white px-3 py-2 shadow-sm xl:col-start-1 xl:row-start-2">
            <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-slate-600">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              Current form (last 5)
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {formLast.length > 0 ?
                formLast.map((f) => {
                  const letter = resultLetter(
                    id,
                    f.home_team_id,
                    f.away_team_id,
                    Number(f.home_score),
                    Number(f.away_score),
                  );
                  const ring =
                    letter === "W" ? "border-emerald-600 bg-emerald-500 text-white"
                    : letter === "L" ? "border-red-600 bg-red-500 text-white"
                    : "border-slate-400 bg-slate-400 text-white";
                  return (
                    <span
                      key={f.id}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-sm ${ring}`}
                      title={letter === "W" ? "Win" : letter === "L" ? "Loss" : "Draw"}
                    >
                      {letter === "W" ?
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      : letter === "L" ?
                        <X className="h-3.5 w-3.5" strokeWidth={3} />
                      : <Minus className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                  );
                })
              : <span className="text-sm text-slate-500">—</span>}
            </div>
          </div>

          <div className="flex min-h-0 flex-col xl:col-start-2 xl:row-span-2 xl:row-start-1">
            <SeasonHistoryPager rows={seasonHistory} />
          </div>
        </div>

        <section className="mb-6">
          <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            <Trophy className="h-4 w-4 text-amber-500" />
            Honours
          </h2>
          {trophies.length === 0 ?
            <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
              No silverware on file — win cups and leagues to fill this cabinet.
            </p>
          : <HonourCabinetChips groups={trophies} defMap={defMap} />}
        </section>

        <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
          <Users className="h-4 w-4 text-slate-400" />
          Squad
        </h2>
        <div className="space-y-6">
          {strikers.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-800">Strikers</h3>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
                {strikers.map((p) => {
                  const goals = statsByPlayerId.get(p.id)?.goals ?? 0;
                  const mvTrend = marketTrendLabel(
                    mvPriorSeasonByPlayer.get(p.id) ?? null,
                    Number(p.market_value),
                  );
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <Link
                        href={`/player/${p.id}`}
                        className="flex min-w-0 items-center gap-2 font-bold text-slate-900 hover:text-emerald-700 hover:underline"
                      >
                        <PlayerAvatar name={p.name} profilePicUrl={p.profile_pic_url} />
                        <span className="truncate">{p.name}</span>
                      </Link>
                      <span className="flex shrink-0 items-center gap-3 text-right text-sm text-slate-500">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700" title="Goals this season">
                          ⚽ {goals}
                        </span>
                        <SquadNationalityCell
                          nationality={p.nationality}
                          code={codeByNationality.get(p.nationality)}
                          flag={flagByNationality.get(p.nationality) ?? null}
                        />
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="font-mono text-slate-800">
                            {formatMoneyPounds(Number(p.market_value))}
                          </span>
                          <span
                            className={
                              mvTrend === "—" ? "text-[0.65rem] text-slate-400"
                              : mvTrend.startsWith("↑") ? "text-[0.65rem] font-semibold text-emerald-700"
                              : mvTrend.startsWith("↓") ? "text-[0.65rem] font-semibold text-red-600"
                              : "text-[0.65rem] font-semibold text-slate-600"
                            }
                            title="Vs prior season (MV history)"
                          >
                            {mvTrend}
                          </span>
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {goalkeepers.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-800">Goalkeepers</h3>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
                {goalkeepers.map((p) => {
                  const saves = statsByPlayerId.get(p.id)?.saves ?? 0;
                  const mvTrend = marketTrendLabel(
                    mvPriorSeasonByPlayer.get(p.id) ?? null,
                    Number(p.market_value),
                  );
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <Link
                        href={`/player/${p.id}`}
                        className="flex min-w-0 items-center gap-2 font-bold text-slate-900 hover:text-emerald-700 hover:underline"
                      >
                        <PlayerAvatar name={p.name} profilePicUrl={p.profile_pic_url} />
                        <span className="truncate">{p.name}</span>
                      </Link>
                      <span className="flex shrink-0 items-center gap-3 text-right text-sm text-slate-500">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700" title="Saves this season">
                          🧤 {saves}
                        </span>
                        <SquadNationalityCell
                          nationality={p.nationality}
                          code={codeByNationality.get(p.nationality)}
                          flag={flagByNationality.get(p.nationality) ?? null}
                        />
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="font-mono text-slate-800">
                            {formatMoneyPounds(Number(p.market_value))}
                          </span>
                          <span
                            className={
                              mvTrend === "—" ? "text-[0.65rem] text-slate-400"
                              : mvTrend.startsWith("↑") ? "text-[0.65rem] font-semibold text-emerald-700"
                              : mvTrend.startsWith("↓") ? "text-[0.65rem] font-semibold text-red-600"
                              : "text-[0.65rem] font-semibold text-slate-600"
                            }
                            title="Vs prior season (MV history)"
                          >
                            {mvTrend}
                          </span>
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </section>

      {(savedMatchRowsNewestFirst ?? []).length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
            Saved match sims
          </h2>
          <p className="mb-3 text-sm text-slate-600">
            Open a frozen report (score, shot feed, ratings) from games you finished in Match center.
            Newest games first; order follows the schedule (week), not when the replay was saved.
          </p>
          <details className="group rounded-xl border border-slate-200 bg-white shadow-sm open:shadow-md">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
              <span>
                Browse {savedMatchRowsNewestFirst.length} saved match
                {savedMatchRowsNewestFirst.length === 1 ? "" : "es"}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="border-t border-slate-100">
              {savedMatchRowsNewestFirst.map((m) => {
                const isHome = m.home_team_id === id;
                const oppId = isHome ? m.away_team_id : m.home_team_id;
                const opp = oppById.get(oppId);
                const oppName = opp?.name ?? "Opponent";
                const oppLogo = opp?.logo_url ?? null;
                const sFor = isHome ? m.home_score : m.away_score;
                const sAgainst = isHome ? m.away_score : m.home_score;
                const selfLogo = team.logo_url;
                const letter = resultLetter(
                  id,
                  m.home_team_id,
                  m.away_team_id,
                  Number(m.home_score),
                  Number(m.away_score),
                );
                const badge =
                  letter === "W" ? "bg-emerald-500 text-white"
                  : letter === "L" ? "bg-red-500 text-white"
                  : "bg-slate-400 text-white";
                const fxRow =
                  m.fixture_id ? savedSimFixtureById.get(m.fixture_id) : undefined;
                const compDisp =
                  fxRow ?
                    clubCompetitionDisplay(
                      {
                        competition: fxRow.competition,
                        league_id: fxRow.league_id,
                        country: fxRow.country,
                        cup_round: fxRow.cup_round,
                      },
                      leagueByIdForUp,
                      flagByCountryForDisplay,
                    )
                  : null;
                const scheduleDetail =
                  fxRow && fxRow.week != null ?
                    savedSimFixtureDetailLine(fxRow.competition, fxRow.cup_round, Number(fxRow.week))
                  : null;
                const breakdown = m.score_breakdown as { displayLine?: string } | null | undefined;
                const aetLine =
                  typeof breakdown?.displayLine === "string" ? breakdown.displayLine : null;
                return (
                  <li key={m.id}>
                    <Link
                      href={`/matches/${m.id}`}
                      className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm transition last:border-b-0 hover:bg-emerald-50/50"
                    >
                      <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-black ${badge}`}>
                        {letter}
                      </span>
                      <span className="inline-flex min-w-0 max-w-[11rem] shrink-0 flex-col gap-0.5 sm:max-w-[14rem]">
                        <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-xs font-semibold text-slate-600">
                          {compDisp?.leagueLogoUrl ?
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={compDisp.leagueLogoUrl}
                              alt=""
                              className="h-6 w-6 shrink-0 rounded-md border border-slate-200/80 bg-white object-contain p-0.5"
                            />
                          : null}
                          {compDisp?.useClBrand ?
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white p-0.5">
                              <CompetitionBrandLogo slug="champions_league" className="h-4 w-4" />
                            </span>
                          : null}
                          {compDisp?.countryFlagEmoji ?
                            <span className="shrink-0 text-base leading-none" aria-hidden>
                              {compDisp.countryFlagEmoji}
                            </span>
                          : null}
                          <span className="min-w-0 truncate">
                            {compDisp?.competitionLabel ?? "Saved match"}
                          </span>
                        </span>
                        {scheduleDetail ?
                          <span className="text-[0.65rem] font-medium text-slate-500">{scheduleDetail}</span>
                        : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {selfLogo ?
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selfLogo}
                            alt=""
                            className="h-9 w-9 rounded-lg border border-slate-200/80 bg-white object-contain p-0.5"
                          />
                        : <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-xs font-bold text-slate-500">
                            {team.name.slice(0, 1)}
                          </span>}
                        <span className="text-xs font-bold text-slate-400">{isHome ? "v" : "@"}</span>
                        {oppLogo ?
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={oppLogo}
                            alt=""
                            className="h-9 w-9 rounded-lg border border-slate-200/80 bg-white object-contain p-0.5"
                          />
                        : <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-xs font-bold text-slate-500">
                            {oppName.slice(0, 1)}
                          </span>}
                      </span>
                      <span className="min-w-0 flex-1 font-semibold text-slate-900">
                        {isHome ? "vs" : "@"} {oppName}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0">
                        <span className="font-mono font-bold tabular-nums text-slate-800">
                          {sFor}–{sAgainst}
                        </span>
                        <AetScoreLine line={aetLine} className="mt-0 justify-end" />
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">{m.season_label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        </section>
      )}

      {(upcomingFx ?? []).length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">
            Schedule (next fixtures)
          </h2>
          <ul className="space-y-2">
            {(upcomingFx ?? []).map((f) => {
              const isHome = f.home_team_id === id;
              const oppId = isHome ? f.away_team_id : f.home_team_id;
              const self = upTeamMap.get(id);
              const opp = upTeamMap.get(oppId);
              const comp = f.competition ?? "league";
              const disp = clubCompetitionDisplay(
                {
                  competition: f.competition,
                  league_id: f.league_id,
                  country: f.country,
                  cup_round: f.cup_round,
                },
                leagueByIdForUp,
                flagByCountryForDisplay,
              );
              const weekLabel = formatFixtureCalendarLabel(f.week, clubFixtureWeekKind(comp));
              return (
                <li
                  key={f.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                >
                  <p className="flex flex-wrap items-center gap-3">
                    {disp.leagueLogoUrl ?
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={disp.leagueLogoUrl}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-lg border border-slate-200/80 bg-white object-contain p-0.5 shadow-sm"
                      />
                    : null}
                    {disp.useClBrand ?
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white p-0.5 shadow-sm">
                        <CompetitionBrandLogo slug="champions_league" className="h-6 w-6" />
                      </span>
                    : null}
                    {disp.countryFlagEmoji ?
                      <span className="text-lg leading-none" aria-hidden>
                        {disp.countryFlagEmoji}
                      </span>
                    : null}
                    <span className="text-lg font-semibold tracking-tight text-slate-900">{weekLabel}</span>
                    <span className="text-sm font-medium tabular-nums text-slate-500">{f.season_label}</span>
                  </p>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-2 font-semibold text-slate-900 sm:justify-end">
                    <span className="inline-flex items-center gap-2">
                      {isHome ?
                        <>
                          {self?.logo_url ?
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={self.logo_url} alt="" className="h-8 w-8 rounded-md object-contain" />
                          : null}
                          <span>{team.name}</span>
                          <span className="text-slate-400">v</span>
                          <Link
                            href={`/team/${oppId}`}
                            className="inline-flex items-center gap-2 hover:text-emerald-800 hover:underline"
                          >
                            {opp?.logo_url ?
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={opp.logo_url} alt="" className="h-8 w-8 rounded-md object-contain" />
                            : null}
                            {opp?.name ?? "Opponent"}
                          </Link>
                        </>
                      : <>
                          <Link
                            href={`/team/${oppId}`}
                            className="inline-flex items-center gap-2 hover:text-emerald-800 hover:underline"
                          >
                            {opp?.logo_url ?
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={opp.logo_url} alt="" className="h-8 w-8 rounded-md object-contain" />
                            : null}
                            {opp?.name ?? "Opponent"}
                          </Link>
                          <span className="text-slate-400">@</span>
                          {self?.logo_url ?
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={self.logo_url} alt="" className="h-8 w-8 rounded-md object-contain" />
                          : null}
                          <span>{team.name}</span>
                        </>
                      }
                    </span>
                  </span>
                  <Link
                    href={`/matchday?homeTeamId=${f.home_team_id}&awayTeamId=${f.away_team_id}&fixtureId=${f.id}`}
                    className="shrink-0 text-xs font-bold text-emerald-700 hover:underline"
                  >
                    Match center →
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
          Transfer history
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          Player moves and fees from Admin transfers, sales, releases, and free-agent pickups.
        </p>
        <details className="group rounded-xl border border-slate-200 bg-white shadow-sm open:shadow-md">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
            <span>
              {(transferTx ?? []).length === 0 ?
                "No transfers recorded"
              : `Browse ${(transferTx ?? []).length} transfer${(transferTx ?? []).length === 1 ? "" : "s"}`}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
          </summary>
          {(transferTx ?? []).length === 0 ?
            <p className="border-t border-slate-100 px-4 py-6 text-center text-sm text-slate-500">
              No transfers recorded yet. Fees appear here when you complete moves in Admin.
            </p>
          : <ul className="space-y-0 border-t border-slate-100">
              {(transferTx ?? []).map((tx) => {
                const { label, colour } = txCategoryDisplay(tx.category);
                const isIncoming = tx.category === "transfer_in" || tx.category === "free_agent_pickup";
                const pname = parsePlayerNameFromTransferNote(tx.note);
                const pid = pname ? playerIdByName.get(pname) : undefined;
                const ppic = pname ? playerPicByName.get(pname) : undefined;
                const buyerName = parseBuyerClubNameFromSaleNote(tx.note);
                const counter =
                  tx.category === "transfer_out" && buyerName ?
                    teamByLowerName.get(buyerName.toLowerCase())
                  : null;
                const labelColour =
                  colour === "green" ? "font-semibold text-emerald-800"
                  : colour === "amber" ? "font-semibold text-amber-900"
                  : colour === "red" ? "font-semibold text-rose-700"
                  : "font-semibold text-slate-600";
                return (
                  <li
                    key={tx.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm transition last:border-b-0 hover:bg-emerald-50/40"
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      {counter?.logo_url ?
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={counter.logo_url}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-md object-contain"
                        />
                      : isIncoming && team.logo_url ?
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={team.logo_url}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-md object-contain opacity-90"
                        />
                      : null}
                      {pname ?
                        <PlayerAvatar name={pname} profilePicUrl={ppic ?? null} sizeClassName="h-8 w-8" />
                      : null}
                      <span className={labelColour}>{label}</span>
                      <span className="text-slate-700">
                        {pname ?
                          pid ?
                            <Link href={`/player/${pid}`} className="font-bold hover:underline">
                              {pname}
                            </Link>
                          : <span className="font-bold">{pname}</span>
                        : (tx.note ?? tx.category)}
                      </span>
                      {counter ?
                        <span className="text-xs text-slate-500">→ {counter.name}</span>
                      : null}
                    </span>
                    <span className="font-mono text-xs text-slate-500">{tx.season_label}</span>
                    <span
                      className={
                        Number(tx.amount) <= 0 ?
                          "font-mono font-bold text-red-700"
                        : "font-mono font-bold text-emerald-700"
                      }
                    >
                      {formatMoneyPounds(Number(Math.abs(tx.amount)))}
                    </span>
                  </li>
                );
              })}
            </ul>
          }
        </details>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
          Finances
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          Prize money from league table finishes (including D2 top spot), domestic cups, Champions League knockouts,
          season wages, and other cash flows recorded from Admin tools.
        </p>
        <details className="group rounded-xl border border-slate-200 bg-white shadow-sm open:shadow-md">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
            <span>
              {(financeTx ?? []).length === 0 ?
                "No finance entries yet"
              : `Browse ${(financeTx ?? []).length} finance entr${(financeTx ?? []).length === 1 ? "y" : "ies"}`}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
          </summary>
          {(financeTx ?? []).length === 0 ?
            <p className="border-t border-slate-100 px-4 py-6 text-center text-sm text-slate-500">
              Nothing logged yet. After you process season end (league prizes, cup finals, CL payouts, wages), entries
              appear here with amounts and notes.
            </p>
          : <ul className="space-y-0 border-t border-slate-100">
              {(financeTx ?? []).map((tx) => {
                const heading = financeCategoryHeading(tx.category);
                const amt = Number(tx.amount);
                const tagBg =
                  tx.category === "wages" ? "bg-rose-100 text-rose-900"
                  : tx.category === "champions_league" ? "bg-indigo-100 text-indigo-900"
                  : tx.category === "league" ? "bg-emerald-100 text-emerald-900"
                  : tx.category === "regional_cup" ? "bg-amber-100 text-amber-900"
                  : tx.category === "promotion" ? "bg-violet-100 text-violet-900"
                  : "bg-slate-100 text-slate-800";
                return (
                  <li
                    key={tx.id}
                    className="flex flex-col gap-1 border-b border-slate-100 px-4 py-3 text-sm transition last:border-b-0 hover:bg-slate-50/80 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                      <span
                        className={`inline-flex w-fit shrink-0 rounded-md px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ${tagBg}`}
                      >
                        {heading}
                      </span>
                      <span className="min-w-0 text-slate-800">
                        {tx.note?.trim() ? tx.note : heading}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
                      <span className="font-mono text-xs text-slate-500">{tx.season_label}</span>
                      <span
                        className={
                          amt < 0 ? "font-mono font-bold text-red-700" : "font-mono font-bold text-emerald-700"
                        }
                      >
                        {formatMoneyPounds(amt)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          }
        </details>
      </section>
      </div>
    </div>
  );
}
