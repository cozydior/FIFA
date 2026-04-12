import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computeStandings, type FixtureRow } from "@/lib/standings";

type LeagueFixture = FixtureRow & { season_label: string; league_id: string | null };
import {
  Check,
  ChevronDown,
  Flag,
  History,
  Minus,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { dashboardDomesticLeagueUrl } from "@/lib/dashboardLinks";
import {
  definitionsBySlug,
  groupTrophyCabinetEntries,
  parseTrophyList,
  resolveTrophyDisplay,
  type TrophyDefinitionRow,
  type TrophySeasonDetail,
} from "@/lib/trophyCabinet";
import { TrophyIconDisplay } from "@/components/TrophyIconDisplay";
import { formatMoneyPounds } from "@/lib/formatMoney";
import { formatFixtureCalendarLabel } from "@/lib/calendarPhases";
import {
  clubCompetitionDisplay,
  clubFixtureWeekKind,
} from "@/lib/matchCompetitionDisplay";
import { CompetitionBrandLogo } from "@/components/CompetitionBrandLogo";
import {
  parseBuyerClubNameFromSaleNote,
  parsePlayerNameFromTransferNote,
} from "@/lib/transferNotes";
import { cupNameForCountry, cupLogoForCountry } from "@/lib/countryCups";
import { txCategoryDisplay } from "@/lib/playerTransfers";
import { competitionBrandLogo } from "@/lib/competitionLogos";

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
  const strikers = squadSorted.filter((p) => p.role === "ST");
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
  const trophies = groupTrophyCabinetEntries(parseTrophyList(team.trophies), defMap);

  const savedRes = await supabase
    .from("saved_sim_matches")
    .select(
      "id, home_score, away_score, season_label, created_at, home_team_id, away_team_id, fixture_id",
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
  const byNationality = new Map<string, number>();
  for (const p of squad) {
    const key = p.nationality || "Unknown";
    byNationality.set(key, (byNationality.get(key) ?? 0) + 1);
  }
  const topNationalities = [...byNationality.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const { data: transferTx } = await supabase
    .from("team_transactions")
    .select("id, amount, category, note, created_at, season_label")
    .eq("team_id", id)
    .in("category", ["transfer_in", "transfer_out", "release", "free_agent_pickup"])
    .order("created_at", { ascending: false })
    .limit(60);

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
        .select("id, competition, league_id, country, cup_round")
        .in("id", savedSimFixtureIds)
    : { data: [] as { id: string; competition: string | null; league_id: string | null; country: string | null; cup_round: string | null }[] };
  const savedSimFixtureById = new Map(
    (savedSimFixturesRaw ?? []).map((f) => [f.id, f]),
  );

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
    const teamIds = teamsByLeague.get(leagueId) ?? [];
    const fx = (leagueFixturesAll ?? []).filter(
      (f) => f.season_label === season && f.league_id === leagueId,
    ) as LeagueFixture[];
    if (teamIds.length === 0 || fx.length === 0) continue;
    const st = computeStandings(teamIds, fx, { mode: "league" });
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

  const leagueDashUrl =
    currentSeason && league ?
      dashboardDomesticLeagueUrl(currentSeason, league.country)
    : null;
  const leagueCountryCode =
    league ? codeByNationality.get(league.country) : undefined;

  // Form based on saved sim matches (most recent first), avoids cup/week ordering issues
  const formLast = [...(savedMatchRows ?? [])]
    .filter((m) => m.home_score != null && m.away_score != null)
    .slice(0, 5)
    .reverse();

  const balance = Number(team.current_balance ?? 0);

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
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              {team.name}
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
                    {league.name}
                  </Link>
                : leagueCountryCode ?
                  <Link
                    href={`/countries/${leagueCountryCode}`}
                    className="font-semibold text-slate-800 hover:text-emerald-800 hover:underline"
                  >
                    {league.name}
                  </Link>
                : <span className="font-semibold text-slate-800">{league.name}</span>}
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
            <p className="mt-4 inline-flex rounded-2xl bg-emerald-50 px-4 py-2 font-mono text-lg font-bold text-emerald-950 ring-1 ring-emerald-200/80">
              Club balance {formatMoneyPounds(balance)}
            </p>
          </div>
          </div>
        </header>

        <section className="mt-8">
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Squad value
            </p>
            <p className="mt-1 text-xl font-black text-slate-900">
              {formatMoneyPounds(totalSquadValue)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Nationalities
            </p>
            <p className="mt-1 text-xl font-black text-slate-900">
              {byNationality.size}
            </p>
          </div>
        </div>

        <div className="mb-6 grid items-start gap-3 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Current form (last 5)
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 shadow-sm ${ring}`}
                      title={letter === "W" ? "Win" : letter === "L" ? "Loss" : "Draw"}
                    >
                      {letter === "W" ?
                        <Check className="h-4 w-4" strokeWidth={3} />
                      : letter === "L" ?
                        <X className="h-4 w-4" strokeWidth={3} />
                      : <Minus className="h-4 w-4" strokeWidth={3} />}
                    </span>
                  );
                })
              : <span className="text-sm text-slate-500">—</span>}
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/95 via-white to-emerald-50/30 px-4 py-4 shadow-md ring-1 ring-slate-200/60">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
              <History className="h-4 w-4 text-emerald-600" />
              Season history
            </p>
            <p className="mt-1 text-[0.7rem] text-slate-500">
              League finishes from completed domestic fixtures (same logic as roll of honour).
            </p>
            {seasonHistory.length === 0 ?
              <p className="mt-3 text-sm text-slate-500">No completed league seasons yet.</p>
            : <ul className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto pr-1">
                {seasonHistory.map((r) => {
                  const tone =
                    r.pos === 1 ? "from-amber-50 to-amber-100/80 border-amber-200/90 ring-amber-200/50"
                    : r.pos === 2 ? "from-slate-50 to-slate-100/70 border-slate-200/90 ring-slate-200/50"
                    : r.pos === 3 ? "from-orange-50/90 to-amber-50/50 border-orange-200/80 ring-orange-100/60"
                    : "from-white to-slate-50/90 border-slate-200/80 ring-slate-100/50";

                  const cupName = cupNameForCountry(r.country);
                  const cupLogoUrl = cupLogoForCountry(r.country);
                  const cupLabel =
                    r.cupRound === "F" ? (r.cupWon ? `Won the ${cupName}` : `${cupName} Final`)
                    : r.cupRound === "SF" ? `${cupName} Semi-final`
                    : r.cupRound === "QF" ? `${cupName} Quarter-final`
                    : r.cupRound ? `${cupName} (${r.cupRound})`
                    : null;

                  const clLabel =
                    r.clRound === "CL_F" ? (r.clWon ? "Champions League Winner" : "CL Final")
                    : r.clRound === "CL_SF1" || r.clRound === "CL_SF2" ? "CL Semi-final"
                    : r.clRound === "CL_GA" || r.clRound === "CL_GB" ? "CL Group stage"
                    : null;

                  return (
                    <li
                      key={`${r.season}-${r.leagueName}-${r.division}`}
                      className={`rounded-xl border bg-gradient-to-r p-3 shadow-sm ring-1 ${tone}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-white/80 px-2 py-0.5 font-mono text-xs font-bold text-slate-600 ring-1 ring-slate-200/80">
                            {r.season}
                          </span>
                          {r.leagueLogoUrl ?
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.leagueLogoUrl}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-lg border border-slate-200/80 bg-white object-contain p-0.5 shadow-sm"
                            />
                          : null}
                          <span className="min-w-0 font-semibold text-slate-900">
                            {r.leagueName}{" "}
                            <span className="font-normal text-slate-600">{r.division}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-black tabular-nums shadow-inner ${
                              r.pos === 1 ? "bg-amber-400 text-amber-950"
                              : r.pos === 2 ? "bg-slate-300 text-slate-900"
                              : r.pos === 3 ? "bg-orange-300 text-orange-950"
                              : "bg-white text-slate-800 ring-1 ring-slate-200"
                            }`}
                            title="League position"
                          >
                            {r.pos}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span>
                          <strong className="text-slate-800">{r.pts}</strong> pts
                        </span>
                        <span className="font-mono">
                          {r.played} played · {r.won}W-{r.drawn}D-{r.lost}L
                        </span>
                      </div>
                      {(cupLabel || clLabel) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {cupLabel && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200/80 bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-800">
                              {cupLogoUrl ?
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={cupLogoUrl} alt="" className="h-4 w-4 rounded object-contain" />
                              : null}
                              {cupLabel}
                            </span>
                          )}
                          {clLabel && (() => {
                            const clLogoUrl = competitionBrandLogo("champions_league");
                            return (
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${r.clWon ? "border-amber-300/80 bg-amber-50 text-amber-800" : "border-sky-200/80 bg-sky-50 text-sky-800"}`}>
                                {clLogoUrl ?
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={clLogoUrl} alt="" className="h-4 w-4 rounded object-contain" />
                                : null}
                                {clLabel}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            }
          </div>
        </div>

        <section className="mb-6">
          <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            <Trophy className="h-4 w-4 text-amber-500" />
            Honours
          </h2>
          {trophies.length === 0 ?
            <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-center text-sm text-slate-500">
              No silverware on file — win cups and leagues to fill this cabinet.
            </p>
          : <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {trophies.map(({ entry: tr, seasons }, i) => {
                const { label, iconUrl } = resolveTrophyDisplay(tr, defMap);
                const seasonKey = seasons
                  .map((s: TrophySeasonDetail) => `${s.season}:${s.won_with ?? ""}`)
                  .join(",");
                return (
                  <li
                    key={`${label}-${seasonKey}-${i}`}
                    className="flex flex-col items-center rounded-2xl border border-slate-300/90 bg-white p-4 text-center shadow-sm"
                  >
                    <div className="mb-2 flex h-14 w-14 items-center justify-center">
                      <TrophyIconDisplay iconUrl={iconUrl} />
                    </div>
                    {seasons.length > 1 && (
                      <span className="mb-0.5 text-xs font-bold text-slate-900">×{seasons.length}</span>
                    )}
                    <span className="text-sm font-bold text-slate-900">{label}</span>
                    {seasons.length > 0 && (
                      <ul className="mt-1 w-full space-y-0.5 text-xs font-medium text-slate-500">
                        {seasons.map((sd) => (
                          <li key={`${sd.season}-${sd.won_with ?? ""}`}>
                            <span className="font-semibold text-slate-700">{sd.season}</span>
                            {sd.won_with ?
                              <span className="text-slate-600"> · {sd.won_with}</span>
                            : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          }
        </section>

        {topNationalities.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {topNationalities.map(([nat, count]) => {
              const cc = codeByNationality.get(nat);
              const inner = (
                <>
                  {flagByNationality.get(nat) ?
                    <span className="text-base leading-none">{flagByNationality.get(nat)}</span>
                  : <Flag className="h-3.5 w-3.5 shrink-0" />}
                  <span>×{count}</span>
                </>
              );
              return cc ?
                  <Link
                    key={nat}
                    href={`/countries/${cc}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-900"
                    title={nat}
                  >
                    {inner}
                  </Link>
                : <span
                    key={nat}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                    title={nat}
                  >
                    {inner}
                  </span>;
            })}
          </div>
        )}

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
                        <span className="font-mono text-slate-800">
                          {formatMoneyPounds(Number(p.market_value))}
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
                        <span className="font-mono text-slate-800">
                          {formatMoneyPounds(Number(p.market_value))}
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

      {(savedMatchRows ?? []).length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
            Saved match sims
          </h2>
          <p className="mb-3 text-sm text-slate-600">
            Open a frozen report (score, shot feed, ratings) from games you finished in Match center.
          </p>
          <details className="group rounded-xl border border-slate-200 bg-white shadow-sm open:shadow-md">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
              <span>
                Browse {savedMatchRows.length} saved match
                {savedMatchRows.length === 1 ? "" : "es"}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="border-t border-slate-100">
              {(savedMatchRows ?? []).map((m) => {
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
                return (
                  <li key={m.id}>
                    <Link
                      href={`/matches/${m.id}`}
                      className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm transition last:border-b-0 hover:bg-emerald-50/50"
                    >
                      <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-black ${badge}`}>
                        {letter}
                      </span>
                      <span className="inline-flex min-w-0 max-w-[11rem] shrink-0 items-center gap-1.5 truncate text-xs font-semibold text-slate-600 sm:max-w-[14rem]">
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
                      <span className="shrink-0 font-mono font-bold tabular-nums text-slate-800">
                        {sFor}–{sAgainst}
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
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">
          Transfer history
        </h2>
        {(transferTx ?? []).length === 0 ?
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-center text-sm text-slate-500">
            No transfers recorded yet. Fees appear here when you complete moves in Admin.
          </p>
        : <ul className="space-y-2">
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
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
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
      </section>
      </div>
    </div>
  );
}
