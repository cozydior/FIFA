import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MvChart } from "./MvChart";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { dashboardDomesticLeagueUrl } from "@/lib/dashboardLinks";
import {
  definitionsBySlug,
  formatLeagueNameForDisplay,
  groupTrophyCabinetEntries,
  parseTrophyList,
  type TrophyDefinitionRow,
} from "@/lib/trophyCabinet";
import { ChevronDown, Trophy } from "lucide-react";
import { HonourCategoryBlock, HonourCabinetChips } from "@/components/HonourCabinetCompact";
import {
  filterCabinetBySlugs,
  filterCabinetExcludeSlugs,
  mergeGroupedBySlug,
  sortCabinetGroups,
} from "@/lib/honourDisplayOrder";
import type { GroupedCabinet } from "@/lib/honourDisplayOrder";
import {
  fetchPlayerTransferTransactions,
  seasonToClubMap,
  transferInsBySeason,
  txCategoryDisplay,
  type TeamMini,
} from "@/lib/playerTransfers";
import { parsePlayerNameFromTransferNote } from "@/lib/transferNotes";
import { formatMoneyPounds } from "@/lib/formatMoney";
import { fotMobBadgeClass, marketTrendLabel } from "@/lib/fotMobBadge";
import { priorSeasonLabel, priorSeasonMvForPlayerHistory } from "@/lib/mvSeasonTrend";
import { compareSeasonLabelsDesc } from "@/lib/seasonLabelSort";
import { CompetitionBrandLogo } from "@/components/CompetitionBrandLogo";
import { formatInternationalCompetitionLabel } from "@/lib/intlCompetitionLabels";

export const revalidate = 60;

/** League stats row; shots_* optional when DB migration not applied (fallback select). */
type PlayerLeagueStatsRow = {
  season: string;
  goals: number | null;
  saves: number | null;
  appearances: number | null;
  average_rating: number | null;
  shots_taken?: number | null;
  shots_faced?: number | null;
  team_id?: string | null;
  teams?:
    | { id: string; name: string; logo_url?: string | null }
    | { id: string; name: string; logo_url?: string | null }[]
    | null;
};

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: player, error } = await supabase
    .from("players")
    .select(
      "id, name, nationality, role, market_value, peak_market_value, career_salary_earned, age, profile_pic_url, team_id, trophies, teams(id, name, logo_url, league_id, leagues(name, logo_url, country, countries(flag_emoji)))",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !player) notFound();

  const rawTeam = player.teams as
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
  const team = Array.isArray(rawTeam) ? rawTeam[0] ?? null : rawTeam;
  const rawLeague = (team as { leagues?: unknown } | null)?.leagues;
  const league = Array.isArray(rawLeague) ? rawLeague[0] ?? null : rawLeague;
  const rawLeagueCountry =
    league &&
    typeof league === "object" &&
    league !== null &&
    "countries" in league
      ? (league as { countries?: unknown }).countries
      : null;
  const country = Array.isArray(rawLeagueCountry)
    ? rawLeagueCountry[0] ?? null
    : rawLeagueCountry;

  const leagueCountryName =
    league && typeof league === "object" && "country" in league ?
      String((league as { country: string }).country)
    : null;

  const [{ data: natRow }, { data: leagueCountryLookup }] = await Promise.all([
    supabase
      .from("countries")
      .select("flag_emoji, code")
      .eq("name", player.nationality)
      .maybeSingle(),
    leagueCountryName ?
      supabase
        .from("countries")
        .select("code")
        .eq("name", leagueCountryName)
        .maybeSingle()
    : Promise.resolve({ data: null }),
  ]);
  const nationalityFlag = natRow?.flag_emoji as string | null | undefined;
  const nationalityCode = natRow?.code as string | null | undefined;
  const leagueCountryCode = leagueCountryLookup?.code as string | null | undefined;

  const { data: history } = await supabase
    .from("player_market_value_history")
    .select("season_label, market_value")
    .eq("player_id", id)
    .order("season_label");

  const { data: statsRowsRaw } = await supabase
    .from("stats")
    .select(
      "season, goals, saves, appearances, average_rating, shots_taken, shots_faced, team_id, teams(id, name, logo_url)",
    )
    .eq("player_id", id)
    .order("season", { ascending: false })
    .then(async (res) => {
      if (!res.error) return res;
      const noShots = await supabase
        .from("stats")
        .select(
          "season, goals, saves, appearances, average_rating, team_id, teams(id, name, logo_url)",
        )
        .eq("player_id", id)
        .order("season", { ascending: false });
      if (!noShots.error) return noShots;
      const noTeam = await supabase
        .from("stats")
        .select(
          "season, goals, saves, appearances, average_rating, shots_taken, shots_faced",
        )
        .eq("player_id", id)
        .order("season", { ascending: false });
      if (!noTeam.error) return noTeam;
      return supabase
        .from("stats")
        .select("season, goals, saves, appearances, average_rating")
        .eq("player_id", id)
        .order("season", { ascending: false });
    });
  const statsRows = [...(statsRowsRaw ?? [])].sort((a, b) =>
    compareSeasonLabelsDesc(a.season, b.season),
  ) as PlayerLeagueStatsRow[];

  const intlPrimary = await supabase
    .from("player_international_stats")
    .select(
      "season_label, competition_slug, caps, goals_for_country, saves_for_country, average_rating, shots_taken, shots_faced",
    )
    .eq("player_id", id)
    .order("season_label", { ascending: false });
  type IntlStatRow = {
    season_label: string;
    competition_slug: string;
    caps: number | null;
    goals_for_country: number | null;
    saves_for_country: number | null;
    average_rating: number | null;
    shots_taken?: number | null;
    shots_faced?: number | null;
  };
  let intlRows = (intlPrimary.data ?? []) as IntlStatRow[];
  if (intlPrimary.error) {
    const fb = await supabase
      .from("player_international_stats")
      .select(
        "season_label, competition_slug, caps, goals_for_country, saves_for_country, average_rating",
      )
      .eq("player_id", id)
      .order("season_label", { ascending: false });
    intlRows = (fb.data ?? []) as IntlStatRow[];
  }
  intlRows = [...intlRows].sort((a, b) => {
    const d = compareSeasonLabelsDesc(a.season_label, b.season_label);
    if (d !== 0) return d;
    return a.competition_slug.localeCompare(b.competition_slug);
  });

  const { data: awardRows } = await supabase
    .from("season_player_awards")
    .select("season_label, award_type")
    .eq("player_id", id)
    .order("season_label", { ascending: false });

  const { data: trophyDefs } = await supabase
    .from("trophy_definitions")
    .select("id, slug, name, icon_url, sort_order");
  const defMap = definitionsBySlug(
    (trophyDefs ?? []) as TrophyDefinitionRow[],
  );
  const cabinetTrophies = groupTrophyCabinetEntries(
    parseTrophyList(player.trophies),
    defMap,
  );

  const awardGroups = new Map<string, string[]>();
  for (const a of awardRows ?? []) {
    const list = awardGroups.get(a.award_type) ?? [];
    list.push(a.season_label);
    awardGroups.set(a.award_type, list);
  }
  for (const [, list] of awardGroups) {
    list.sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  }

  const PERSONAL_SLUGS = new Set(["ballon_dor", "palm_dor"]);
  const INTL_SLUGS = new Set(["world_cup", "nations_league", "gold_cup"]);

  const fromAwardsPersonal: GroupedCabinet[] = [...awardGroups.entries()]
    .filter(([at]) => PERSONAL_SLUGS.has(at))
    .map(([at, seasons]) => ({
      entry: { trophy_slug: at },
      seasons: seasons.map((s) => ({ season: s })),
    }));
  const personalFromCabinet = filterCabinetBySlugs(
    cabinetTrophies,
    PERSONAL_SLUGS,
  );
  const personalHonours = sortCabinetGroups(
    mergeGroupedBySlug([...fromAwardsPersonal, ...personalFromCabinet]),
    "player_personal",
    defMap,
  );
  const intlHonours = sortCabinetGroups(
    filterCabinetBySlugs(cabinetTrophies, INTL_SLUGS),
    "player_intl",
    defMap,
  );
  const clubHonours = sortCabinetGroups(
    filterCabinetExcludeSlugs(
      filterCabinetExcludeSlugs(cabinetTrophies, PERSONAL_SLUGS),
      INTL_SLUGS,
    ),
    "player_club",
    defMap,
  );
  const hasHonoursSection =
    personalHonours.length + intlHonours.length + clubHonours.length > 0;

  const currentSeason = await getCurrentSeasonLabel();
  const liveMv = Number(player.market_value ?? 0);

  const roleForMvRank = player.role === "ST" || player.role === "GK";
  const { data: mvRankRows } =
    roleForMvRank ?
      await supabase
        .from("players")
        .select("nationality, role, market_value")
        .in("role", ["ST", "GK"])
    : { data: [] as { nationality: string | null; role: string | null; market_value: number | null }[] };

  let mvRankCountry: number | null = null;
  let mvRankGlobalRole: number | null = null;
  if (roleForMvRank && (mvRankRows?.length ?? 0) > 0) {
    const sameRole = (mvRankRows ?? []).filter((r) => r.role === player.role);
    if (sameRole.length > 0) {
      mvRankGlobalRole =
        sameRole.filter((r) => Number(r.market_value ?? 0) > liveMv).length + 1;
    }
    if (player.nationality && sameRole.length > 0) {
      const natCohort = sameRole.filter((r) => r.nationality === player.nationality);
      if (natCohort.length > 0) {
        mvRankCountry =
          natCohort.filter((r) => Number(r.market_value ?? 0) > liveMv).length + 1;
      }
    }
  }

  const chartData = (() => {
    const pts =
      history?.map((h) => ({
        season: h.season_label,
        mv: Number(h.market_value),
      })) ?? [];
    if (!currentSeason) return pts;
    const i = pts.findIndex((p) => p.season === currentSeason);
    if (i >= 0) {
      const next = [...pts];
      next[i] = { season: currentSeason, mv: liveMv };
      return next;
    }
    return [...pts, { season: currentSeason, mv: liveMv }];
  })();

  const priorSeasonName =
    currentSeason ?
      priorSeasonLabel(
        currentSeason,
        (history ?? []).map((h) => h.season_label as string),
      )
    : null;
  const priorSeasonStoredMv = priorSeasonMvForPlayerHistory(
    (history ?? []).map((h) => ({
      season_label: h.season_label as string,
      market_value: Number(h.market_value),
    })),
    currentSeason,
  );
  const mvYearOverYearTrend = marketTrendLabel(priorSeasonStoredMv, liveMv);
  const leagueDashboardUrl =
    currentSeason && leagueCountryName ?
      dashboardDomesticLeagueUrl(currentSeason, leagueCountryName)
    : null;
  const seasonRow = currentSeason
    ? statsRows?.find((s) => s.season === currentSeason)
    : null;
  const careerGoals = (statsRows ?? []).reduce((a, s) => a + (s.goals ?? 0), 0);
  const careerSaves = (statsRows ?? []).reduce((a, s) => a + (s.saves ?? 0), 0);
  const intlGoals = (intlRows ?? []).reduce((a, r) => a + Number(r.goals_for_country ?? 0), 0);
  const intlSaves = (intlRows ?? []).reduce((a, r) => a + Number(r.saves_for_country ?? 0), 0);
  const intlShotsTakenTotal = intlRows.reduce(
    (a, r) => a + Number(r.shots_taken ?? 0),
    0,
  );
  const intlShotsFacedTotal = intlRows.reduce(
    (a, r) => a + Number(r.shots_faced ?? 0),
    0,
  );
  const intlShotsDisplay =
    player.role === "GK" ? intlShotsFacedTotal : intlShotsTakenTotal;

  const careerGoalsAll = careerGoals + intlGoals;
  const careerSavesAll = careerSaves + intlSaves;

  const teamLogo = (team as { logo_url?: string } | null)?.logo_url;

  // Collect all won_with values from the trophy cabinet to look up flags/logos
  const wonWithNames = [
    ...new Set(
      cabinetTrophies.flatMap(({ seasons }) =>
        seasons.map((s) => s.won_with).filter(Boolean) as string[],
      ),
    ),
  ];
  const [{ data: wonWithCountries }, { data: wonWithTeams }] =
    await Promise.all([
      wonWithNames.length > 0
        ? supabase
            .from("countries")
            .select("name, flag_emoji")
            .in("name", wonWithNames)
        : Promise.resolve({ data: [] }),
      wonWithNames.length > 0
        ? supabase
            .from("teams")
            .select("name, logo_url")
            .in("name", wonWithNames)
        : Promise.resolve({ data: [] }),
    ]);
  const wonWithFlagMap = new Map<string, string>(
    (wonWithCountries ?? [])
      .filter((c) => c.flag_emoji)
      .map((c) => [c.name, c.flag_emoji as string]),
  );
  const wonWithLogoMap = new Map<string, string>(
    (wonWithTeams ?? [])
      .filter((t) => t.logo_url)
      .map((t) => [t.name, t.logo_url as string]),
  );

  const transferRows = await fetchPlayerTransferTransactions(supabase, player.name);

  const nameSet = new Set<string>();
  for (const r of transferRows) {
    const n = parsePlayerNameFromTransferNote(r.note);
    if (n) nameSet.add(n);
  }
  const txPlayerIds = new Map<string, string>([[player.name, id]]);
  if (nameSet.size > 0) {
    const { data: byNames } = await supabase
      .from("players")
      .select("id, name")
      .in("name", [...nameSet]);
    for (const p of byNames ?? []) txPlayerIds.set(p.name, p.id);
  }

  const insBySeason = transferInsBySeason(transferRows);
  const currentTeamMini: TeamMini | null =
    team ?
      { id: team.id, name: team.name, logo_url: (team as { logo_url?: string }).logo_url ?? null }
    : null;
  const clubBySeason = seasonToClubMap(
    (statsRows ?? []).map((s) => s.season),
    insBySeason,
    currentSeason,
    currentTeamMini,
    transferRows,
  );
  for (const r of statsRows ?? []) {
    const raw = r.teams;
    const t = Array.isArray(raw) ? raw[0] : raw;
    if (t?.id) {
      clubBySeason.set(r.season, {
        id: t.id,
        name: t.name,
        logo_url: t.logo_url ?? null,
      });
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f1f5f9_0%,#f8fafc_12rem,#f1f5f9_100%)]">
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
            {player.profile_pic_url ?
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={player.profile_pic_url}
                alt=""
                className="mx-auto h-36 w-36 shrink-0 rounded-2xl border border-slate-200/90 object-cover shadow-md ring-1 ring-slate-200/60 sm:mx-0 sm:h-40 sm:w-40"
                decoding="async"
              />
            : <div className="mx-auto flex h-36 w-36 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-200/80 text-4xl font-black text-slate-600 shadow-inner sm:mx-0 sm:h-40 sm:w-40">
                {player.name.slice(0, 1)}
              </div>
            }
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-emerald-700/90">
                Player profile
              </p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                {player.name}
              </h1>
              <p className="mt-2 text-sm font-medium text-slate-600">
                {nationalityCode ?
                  <Link
                    href={`/countries/${nationalityCode.toLowerCase()}`}
                    className="inline-flex items-center gap-1.5 font-semibold text-slate-800 hover:text-emerald-800 hover:underline"
                  >
                    {nationalityFlag ?
                      <span className="text-lg leading-none">{nationalityFlag}</span>
                    : null}
                    {player.nationality}
                  </Link>
                : (
                  <>
                    {nationalityFlag ?
                      <span className="mr-1.5 text-lg leading-none">{nationalityFlag}</span>
                    : null}
                    {player.nationality}
                  </>
                )}
                {" "}
                · {player.role} · {player.age} yrs
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {team && (
                  <Link
                    href={`/team/${team.id}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/90 bg-emerald-50/80 px-3 py-2 text-sm font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-100/80"
                  >
                    {teamLogo ?
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={teamLogo}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-md object-contain"
                        decoding="async"
                      />
                    : null}
                    <span>{team.name}</span>
                  </Link>
                )}
                {league?.logo_url && (leagueDashboardUrl || leagueCountryCode) ?
                  <Link
                    href={leagueDashboardUrl ?? `/countries/${leagueCountryCode!.toLowerCase()}`}
                    className="shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={league.logo_url}
                      alt=""
                      className="h-6 w-6 rounded object-contain opacity-90 transition hover:opacity-100"
                    />
                  </Link>
                : league?.logo_url ?
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={league.logo_url} alt="" className="h-6 w-6 rounded object-contain opacity-90" />
                : null}
                {league?.name ?
                  leagueDashboardUrl ?
                    <Link
                      href={leagueDashboardUrl}
                      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 ring-1 ring-slate-200/80 transition hover:bg-emerald-50 hover:ring-emerald-200"
                    >
                      {formatLeagueNameForDisplay(league.name)}
                    </Link>
                  : leagueCountryCode ?
                    <Link
                      href={`/countries/${leagueCountryCode.toLowerCase()}`}
                      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-800 ring-1 ring-slate-200/80 transition hover:bg-emerald-50"
                    >
                      {formatLeagueNameForDisplay(league.name)}
                    </Link>
                  : <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-800 ring-1 ring-slate-200/80">
                      {formatLeagueNameForDisplay(league.name)}
                    </span>
                : null}
                {country && typeof country === "object" && "flag_emoji" in country && country.flag_emoji ?
                  leagueCountryCode ?
                    <Link
                      href={`/countries/${leagueCountryCode.toLowerCase()}`}
                      className="text-xl leading-none transition hover:opacity-80"
                      title={leagueCountryName ?? "Country"}
                    >
                      {(country as { flag_emoji: string }).flag_emoji}
                    </Link>
                  : <span className="text-xl leading-none">{(country as { flag_emoji: string }).flag_emoji}</span>
                : null}
              </div>
            </div>
          </div>
          <div className="grid gap-px border-t border-slate-200/90 bg-slate-200/90 sm:grid-cols-3">
            <div className="bg-white px-4 py-4 text-center sm:px-6 sm:text-left">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
                Market value
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-slate-900 sm:text-2xl">
                {formatMoneyPounds(Number(player.market_value))}
              </p>
              <p className="mt-1.5 text-xs font-semibold leading-snug text-slate-600">
                <span className="text-slate-500">vs prior season</span>
                {priorSeasonName ?
                  <span className="ml-1 font-mono text-[0.7rem] text-slate-400">({priorSeasonName})</span>
                : null}
                <span
                  className={
                    mvYearOverYearTrend === "—" ? "ml-1 text-slate-400"
                    : mvYearOverYearTrend.startsWith("↑") ? "ml-1 text-emerald-700"
                    : mvYearOverYearTrend.startsWith("↓") ? "ml-1 text-red-600"
                    : "ml-1 text-slate-600"
                  }
                >
                  {mvYearOverYearTrend}
                </span>
              </p>
              {mvRankCountry != null || mvRankGlobalRole != null ?
                <ul className="mt-2 space-y-0.5 font-mono text-[0.65rem] font-semibold tabular-nums text-slate-500">
                  {mvRankCountry != null ?
                    <li>
                      <span className="text-slate-400">Country</span>{" "}
                      <span className="text-slate-700">#{mvRankCountry}</span>
                    </li>
                  : null}
                  {mvRankGlobalRole != null ?
                    <li>
                      <span className="text-slate-400">Global ({player.role})</span>{" "}
                      <span className="text-slate-700">#{mvRankGlobalRole}</span>
                    </li>
                  : null}
                </ul>
              : null}
            </div>
            <div className="bg-white px-4 py-4 text-center sm:px-6 sm:text-left">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
                Peak value
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-sky-900 sm:text-2xl">
                {formatMoneyPounds(Number(player.peak_market_value ?? 0))}
              </p>
            </div>
            <div className="bg-white px-4 py-4 text-center sm:px-6 sm:text-left">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
                Career salary earned
              </p>
              <p
                className="mt-1 font-mono text-xl font-bold text-violet-950 sm:text-2xl"
                title="Imputed from season wage runs while at a club"
              >
                {formatMoneyPounds(Number(player.career_salary_earned ?? 0))}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-2 xl:items-stretch xl:gap-10">
        <section className="flex h-full min-h-0 min-w-0 flex-col">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
            Market value over time
          </h2>
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
            <MvChart data={chartData} />
          </div>
        </section>

        <section className="flex h-full min-h-0 min-w-0 flex-col">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
            League — {currentSeason ?? "current season"}
            {team && (
              <span className="ml-2 font-normal text-slate-500">
                ({team.name})
              </span>
            )}
          </h2>
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-5 shadow-sm sm:p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              {player.role !== "GK" && (
                <div className="flex items-center justify-between gap-4 border-b border-emerald-100/80 pb-3 sm:border-0 sm:pb-0">
                  <dt className="text-sm font-medium text-emerald-900/90">Goals (season)</dt>
                  <dd className="font-mono text-2xl font-black text-emerald-950">
                    {seasonRow?.goals ?? 0}
                  </dd>
                </div>
              )}
              {player.role !== "ST" && (
                <div className="flex items-center justify-between gap-4 border-b border-emerald-100/80 pb-3 sm:border-0 sm:pb-0">
                  <dt className="text-sm font-medium text-emerald-900/90">Saves (season)</dt>
                  <dd className="font-mono text-2xl font-black text-emerald-950">
                    {seasonRow?.saves ?? 0}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <dt className="text-sm font-medium text-emerald-900/90">
                  {player.role === "GK" ? "Shots faced" : "Shots taken"}
                </dt>
                <dd className="font-mono text-2xl font-black text-emerald-950">
                  {player.role === "GK"
                    ? (seasonRow?.shots_faced ?? 0)
                    : (seasonRow?.shots_taken ?? 0)}
                </dd>
              </div>
              {seasonRow?.average_rating != null && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-sm font-medium text-emerald-900/90">Avg rating</dt>
                  <dd>
                    <span className={fotMobBadgeClass(Number(seasonRow.average_rating))}>
                      {Number(seasonRow.average_rating).toFixed(1)}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-5 border-t border-emerald-100/90 pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Career league totals
              </p>
              <div className="mt-3 flex flex-wrap gap-6">
                {player.role !== "GK" && (
                  <>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-mono text-2xl font-black text-slate-900">{careerGoals}</span>
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        League goals
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-mono text-2xl font-black text-slate-900">{careerGoalsAll}</span>
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Total goals
                      </span>
                      <span className="text-[0.65rem] font-medium text-slate-400">League + international</span>
                    </div>
                  </>
                )}
                {player.role !== "ST" && (
                  <>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-mono text-2xl font-black text-slate-900">{careerSaves}</span>
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        League saves
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-mono text-2xl font-black text-slate-900">{careerSavesAll}</span>
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Total saves
                      </span>
                      <span className="text-[0.65rem] font-medium text-slate-400">League + international</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
        </div>

      {hasHonoursSection && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            <Trophy className="h-4 w-4 text-amber-500" />
            Honours
          </h2>
          <div className="space-y-5">
            {personalHonours.length > 0 && (
              <HonourCategoryBlock label="Personal">
                <HonourCabinetChips
                  groups={personalHonours}
                  defMap={defMap}
                  wonWithFlagMap={wonWithFlagMap}
                  wonWithLogoMap={wonWithLogoMap}
                />
              </HonourCategoryBlock>
            )}
            {intlHonours.length > 0 && (
              <HonourCategoryBlock label="International">
                <HonourCabinetChips
                  groups={intlHonours}
                  defMap={defMap}
                  wonWithFlagMap={wonWithFlagMap}
                  wonWithLogoMap={wonWithLogoMap}
                />
              </HonourCategoryBlock>
            )}
            {clubHonours.length > 0 && (
              <HonourCategoryBlock label="Club">
                <HonourCabinetChips
                  groups={clubHonours}
                  defMap={defMap}
                  wonWithFlagMap={wonWithFlagMap}
                  wonWithLogoMap={wonWithLogoMap}
                />
              </HonourCategoryBlock>
            )}
          </div>
        </section>
      )}

      {transferRows.length > 0 && (
        <details className="group mt-8 rounded-xl border border-slate-200 bg-white shadow-sm open:shadow-md">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Transfer history
            </h2>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="space-y-2 border-t border-slate-100 px-4 py-3">
            {transferRows.map((tx) => {
              const t = Array.isArray(tx.teams) ? tx.teams[0] : tx.teams;
              const { label, colour } = txCategoryDisplay(tx.category);
              const labelColour =
                colour === "green" ? "font-semibold text-emerald-800"
                : colour === "amber" ? "font-semibold text-amber-900"
                : colour === "red" ? "font-semibold text-rose-700"
                : "font-semibold text-slate-600";
              const pid = parsePlayerNameFromTransferNote(tx.note);
              const playerHref = pid ? txPlayerIds.get(pid) : undefined;
              return (
                <li
                  key={tx.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    {t?.logo_url ?
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.logo_url}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-md object-contain"
                      />
                    : null}
                    <span className={labelColour}>{label}</span>
                    <span className="text-slate-600">
                      {t?.name ?
                        <span className="font-semibold">{t.name}</span>
                      : playerHref ?
                        <Link href={`/player/${playerHref}`} className="font-semibold hover:underline">
                          {pid}
                        </Link>
                      : <span className="font-semibold">{tx.note ?? "—"}</span>}
                    </span>
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
        </details>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
          Season-by-season (league)
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Season</th>
                <th className="px-4 py-2">Club</th>
                <th className="px-4 py-2 text-right">{player.role === "GK" ? "Shots faced" : "Shots"}</th>
                {player.role !== "GK" ?
                  <th className="px-4 py-2 text-right">Goals</th>
                : null}
                {player.role !== "ST" ?
                  <th className="px-4 py-2 text-right">Saves</th>
                : null}
                <th className="px-4 py-2 text-right">Avg</th>
              </tr>
            </thead>
            <tbody>
              {(statsRows ?? []).map((r) => {
                const club = clubBySeason.get(r.season);
                return (
                <tr key={r.season} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-semibold text-slate-900">{r.season}</td>
                  <td className="px-4 py-2">
                    {club ?
                      <Link
                        href={`/team/${club.id}`}
                        className="inline-flex items-center gap-2 font-medium text-slate-800 hover:text-emerald-800 hover:underline"
                      >
                        {club.logo_url ?
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={club.logo_url}
                            alt=""
                            className="h-6 w-6 rounded object-contain"
                          />
                        : null}
                        {club.name}
                      </Link>
                    : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {player.role === "GK" ? (r.shots_faced ?? 0) : (r.shots_taken ?? 0)}
                  </td>
                  {player.role !== "GK" ?
                    <td className="px-4 py-2 text-right font-mono">{r.goals ?? 0}</td>
                  : null}
                  {player.role !== "ST" ?
                    <td className="px-4 py-2 text-right font-mono">{r.saves ?? 0}</td>
                  : null}
                  <td className="px-4 py-2 text-right">
                    {r.average_rating != null ?
                      <span className={fotMobBadgeClass(Number(r.average_rating))}>
                        {Number(r.average_rating).toFixed(1)}
                      </span>
                    : "—"}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
          International
        </h2>
        <div
          className={`grid gap-3 ${player.role === "ST" || player.role === "GK" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
        >
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Shots (international)
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900">{intlShotsDisplay}</p>
          </div>
          {player.role !== "GK" && (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Goals for country</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{intlGoals}</p>
            </div>
          )}
          {player.role !== "ST" && (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Saves for country</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{intlSaves}</p>
            </div>
          )}
        </div>
        {(intlRows ?? []).length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">Season</th>
                  <th className="px-4 py-2">Competition</th>
                  <th className="px-4 py-2 text-right">Shots</th>
                  {player.role !== "GK" ?
                    <th className="px-4 py-2 text-right">Goals</th>
                  : null}
                  {player.role !== "ST" ?
                    <th className="px-4 py-2 text-right">Saves</th>
                  : null}
                  <th className="px-4 py-2 text-right">Avg</th>
                </tr>
              </thead>
              <tbody>
                {(intlRows ?? []).map((r, idx) => (
                  <tr key={`${r.season_label}-${r.competition_slug}-${idx}`} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-semibold text-slate-900">{r.season_label}</td>
                    <td className="px-4 py-2 text-slate-700">
                      <span className="inline-flex items-center gap-2">
                        {(r.competition_slug === "nations_league" ||
                          r.competition_slug === "gold_cup" ||
                          r.competition_slug === "world_cup") ?
                          <CompetitionBrandLogo
                            slug={r.competition_slug}
                            className="h-6 w-6 shrink-0"
                          />
                        : null}
                        <span className="font-medium">
                          {formatInternationalCompetitionLabel(r.competition_slug)}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {player.role === "GK" ?
                        Number(r.shots_faced ?? 0)
                      : Number(r.shots_taken ?? 0)}
                    </td>
                    {player.role !== "GK" ?
                      <td className="px-4 py-2 text-right font-mono">{r.goals_for_country ?? 0}</td>
                    : null}
                    {player.role !== "ST" ?
                      <td className="px-4 py-2 text-right font-mono">{r.saves_for_country ?? 0}</td>
                    : null}
                    <td className="px-4 py-2 text-right">
                      {r.average_rating != null ?
                        <span className={fotMobBadgeClass(Number(r.average_rating))}>
                          {Number(r.average_rating).toFixed(1)}
                        </span>
                      : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
