import Link from "next/link";
import { Goal, LayoutDashboard, Newspaper, Radio, Shield, Trophy } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getDashboardSummary } from "@/lib/dashboardData";
import { formatFixtureCalendarLabel } from "@/lib/calendarPhases";
import { internationalGroupStandingRowClass } from "@/lib/internationalStandingsUi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { computeInternationalTable } from "@/lib/international";
import { fotMobBadgeClass } from "@/lib/fotMobBadge";
import { internationalSubToSlug } from "@/lib/competitionLogos";
import { CompetitionBrandLogo } from "@/components/CompetitionBrandLogo";
import { IntlKnockoutBracket } from "@/components/IntlKnockoutBracket";
import { ChampionsLeagueSeedControls } from "@/components/ChampionsLeagueSeedControls";
import { RegionalCupBracket } from "@/components/RegionalCupBracket";
import {
  fetchChampionsLeagueRollFromFixtures,
  fetchDomesticRollOfHonourForCountry,
  fetchDomesticCupRoll,
  fetchInternationalRollOfHonour,
  type DomesticCupRoll,
} from "@/lib/competitionHistory";
import { cupNameForCountry, cupLogoForCountry } from "@/lib/countryCups";
import { fetchSeasonSavedMatchLeaderboards } from "@/lib/seasonLeaderboards";
import type { DashboardUpcomingClub } from "@/lib/dashboardData";
import { formatMoneyPounds } from "@/lib/formatMoney";
import { getSimPreviewTestMode } from "@/lib/appSettings";
import { InternationalTournamentActionBar } from "@/components/InternationalTournamentActionBar";
import { ChampionsLeagueTournamentBoard } from "@/components/ChampionsLeagueTournamentBoard";

export const dynamic = "force-dynamic";
type DashboardData = Awaited<ReturnType<typeof getDashboardSummary>>;

type DashboardNav =
  | { group: "leagues"; sub: "england" | "spain" | "france" }
  | { group: "cl"; sub: null }
  | { group: "international"; sub: "nations-league" | "gold-cup" | "world-cup" }
  | { group: "rankings"; sub: null };

function resolveDashboardNav(
  sp: Record<string, string | string[] | undefined>,
): DashboardNav {
  const group = typeof sp.group === "string" ? sp.group.toLowerCase().trim() : "";
  const sub = typeof sp.sub === "string" ? sp.sub.toLowerCase().trim() : "";
  const tab = typeof sp.tab === "string" ? sp.tab.toLowerCase().trim() : "";

  if (group === "leagues" && (sub === "england" || sub === "spain" || sub === "france")) {
    return { group: "leagues", sub };
  }
  if (group === "cl") return { group: "cl", sub: null };
  if (
    group === "international" &&
    (sub === "nations-league" || sub === "gold-cup" || sub === "world-cup")
  ) {
    return { group: "international", sub };
  }
  if (group === "rankings") return { group: "rankings", sub: null };

  if (tab === "champions-league") return { group: "cl", sub: null };
  if (tab === "rankings") return { group: "rankings", sub: null };
  if (tab === "nations-league") return { group: "international", sub: "nations-league" };
  if (tab === "gold-cup") return { group: "international", sub: "gold-cup" };
  if (tab === "world-cup") return { group: "international", sub: "world-cup" };
  if (tab === "england" || tab === "spain" || tab === "france") {
    return { group: "leagues", sub: tab };
  }

  return { group: "leagues", sub: "england" };
}

function buildDashboardQuery(opts: {
  season: string;
  nav: DashboardNav;
  view?: "honours";
}): string {
  const p = new URLSearchParams();
  p.set("season", opts.season);
  if (opts.nav.group === "leagues") {
    p.set("group", "leagues");
    p.set("sub", opts.nav.sub);
  } else if (opts.nav.group === "cl") {
    p.set("group", "cl");
  } else if (opts.nav.group === "international") {
    p.set("group", "international");
    p.set("sub", opts.nav.sub);
  } else if (opts.nav.group === "rankings") {
    p.set("group", "rankings");
  }
  if (opts.view === "honours") p.set("view", "honours");
  return p.toString();
}

function dashHref(
  season: string,
  nav: DashboardNav,
  honours: boolean,
): string {
  return `/dashboard?${buildDashboardQuery({
    season,
    nav,
    view: honours ? "honours" : undefined,
  })}`;
}

/**
 * Single background + left bar (avoids competing Tailwind bg-* classes).
 * 4-team leagues: D1 — 1st title+CL, 2nd CL, 4th relegation; D2 — 1st promotion.
 */
function domesticStandingRowClass(division: string, indexZeroBased: number): string {
  const d = division.trim().toUpperCase();
  if (d === "D1") {
    if (indexZeroBased === 0) {
      return "border-l-[5px] border-emerald-600 bg-emerald-50";
    }
    if (indexZeroBased === 1) {
      return "border-l-[5px] border-sky-600 bg-sky-50";
    }
    if (indexZeroBased === 3) {
      return "border-l-[5px] border-amber-600 bg-amber-50";
    }
    return indexZeroBased % 2 === 0 ?
        "border-l-[5px] border-slate-200 bg-white"
      : "border-l-[5px] border-slate-200 bg-slate-50/90";
  }
  if (d === "D2") {
    if (indexZeroBased === 0) {
      return "border-l-[5px] border-emerald-600 bg-emerald-50";
    }
    return indexZeroBased % 2 === 0 ?
        "border-l-[5px] border-slate-200 bg-white"
      : "border-l-[5px] border-slate-200 bg-slate-50/90";
  }
  return indexZeroBased % 2 === 0 ? "bg-white" : "bg-slate-50/90";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const seasonFromUrl = typeof sp.season === "string" ? sp.season : "";
  const currentSeason = await getCurrentSeasonLabel();
  const selectedSeason = seasonFromUrl.trim() || currentSeason || "";
  const nav = resolveDashboardNav(sp);
  const honoursView = sp.view === "honours";
  const previewEnabled = await getSimPreviewTestMode();

  let data: DashboardData | null = null;
  let error: string | null = null;
  try {
    data = await getDashboardSummary(selectedSeason || undefined);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load dashboard";
  }

  const tablesByCountry = new Map<string, DashboardData["tables"]>();
  for (const t of data?.tables ?? []) {
    const existing = tablesByCountry.get(t.country) ?? [];
    tablesByCountry.set(t.country, [...existing, t]);
  }
  const countries = [...tablesByCountry.keys()].sort();
  const supabase = getSupabaseAdmin();
  const [{ data: seasons }, { data: countriesDb }] = await Promise.all([
    supabase.from("seasons").select("label").order("created_at", { ascending: false }),
    supabase.from("countries").select("name, flag_emoji"),
  ]);
  const countryFlag = new Map((countriesDb ?? []).map((c) => [c.name.toLowerCase(), c.flag_emoji]));

  async function getIntl(slug: string) {
    if (!selectedSeason) return { table: [], fixtures: [] as any[] };
    const { data: comp } = await supabase
      .from("international_competitions")
      .select("id")
      .eq("season_label", selectedSeason)
      .eq("slug", slug)
      .maybeSingle();
    if (!comp) return { table: [], fixtures: [] as any[] };
    const [{ data: entries }, { data: fixtures }, { data: nts }] = await Promise.all([
      supabase.from("international_entries").select("national_team_id").eq("competition_id", comp.id),
      supabase
        .from("international_fixtures")
        .select(
          "id, week, stage, group_name, status, home_score, away_score, home_national_team_id, away_national_team_id, score_detail",
        )
        .eq("competition_id", comp.id)
        .order("week"),
      supabase.from("national_teams").select("id, name, flag_emoji, countries(code, flag_emoji)"),
    ]);
    const ntMeta = new Map(
      (nts ?? []).map((row: any) => {
        const c = row.countries;
        const country = Array.isArray(c) ? c[0] : c;
        const codeRaw = country?.code;
        const code =
          typeof codeRaw === "string" ? codeRaw.toLowerCase() : null;
        const flagFromCountry =
          typeof country?.flag_emoji === "string" && country.flag_emoji.trim() ?
            country.flag_emoji
          : null;
        return [
          row.id,
          {
            name: row.name as string,
            flag: flagFromCountry ?? (row.flag_emoji as string | null) ?? "🏳️",
            code,
          },
        ];
      }),
    );
    const table = computeInternationalTable(
      (entries ?? []).map((e) => e.national_team_id),
      fixtures ?? [],
    );
    const groupFixtures = (fixtures ?? []).filter((f: any) => f.stage === "group");
    const groups = [...new Set(groupFixtures.map((f: any) => f.group_name).filter(Boolean))] as string[];
    const groupTables = groups.map((g) => {
      const gf = groupFixtures.filter((f: any) => f.group_name === g);
      const ids = [...new Set(gf.flatMap((f: any) => [f.home_national_team_id, f.away_national_team_id]))];
      const gt = computeInternationalTable(ids, gf as any);
      return {
        group: g,
        table: gt.map((r) => {
          const m = ntMeta.get(r.teamId);
          return {
            ...r,
            name: m?.name ?? r.teamId,
            flag: m?.flag ?? "🏳️",
            countryCode: m?.code ?? null,
          };
        }),
      };
    });
    return {
      table: table.map((r) => {
        const m = ntMeta.get(r.teamId);
        return {
          ...r,
          name: m?.name ?? r.teamId,
          flag: m?.flag ?? "🏳️",
          countryCode: m?.code ?? null,
        };
      }),
      fixtures: (fixtures ?? []).map((f) => {
        const h = ntMeta.get(f.home_national_team_id);
        const a = ntMeta.get(f.away_national_team_id);
        const detail = (f as { score_detail?: { displayLine?: string } | null }).score_detail;
        return {
          ...f,
          home: h?.name ?? f.home_national_team_id,
          away: a?.name ?? f.away_national_team_id,
          homeFlag: h?.flag ?? "🏳️",
          awayFlag: a?.flag ?? "🏳️",
          homeCode: h?.code ?? null,
          awayCode: a?.code ?? null,
          scoreDisplay:
            typeof detail?.displayLine === "string" ? detail.displayLine : null,
        };
      }),
      groupTables,
    };
  }

  const domesticCountryName =
    nav.group === "leagues" ? capitalize(nav.sub) : "";
  const { data: regionalCupRaw } =
    selectedSeason && nav.group === "leagues" ?
      await supabase
        .from("fixtures")
        .select(
          "id, week, cup_round, status, home_score, away_score, home_team_id, away_team_id, country, score_detail, sort_order",
        )
        .eq("season_label", selectedSeason)
        .eq("competition", "regional_cup")
        .eq("country", domesticCountryName)
        .order("week")
    : { data: [] as { id: string; week: number; cup_round: string | null; status: string; home_score: number | null; away_score: number | null; home_team_id: string; away_team_id: string; country: string | null; score_detail: { displayLine?: string } | null; sort_order: number | null }[] };

  const cupTeamIds = [
    ...new Set(
      (regionalCupRaw ?? []).flatMap((f) => [f.home_team_id, f.away_team_id]),
    ),
  ];
  const { data: regionalTeamRows } =
    cupTeamIds.length > 0 ?
      await supabase
        .from("teams")
        .select("id, name, logo_url, leagues(division)")
        .in("id", cupTeamIds)
    : { data: [] as { id: string; name: string; logo_url: string | null; leagues: { division: string } | { division: string }[] | null }[] };
  const regionalTeamName = new Map((regionalTeamRows ?? []).map((t) => [t.id, t.name]));
  const regionalTeamLogo = new Map(
    (regionalTeamRows ?? []).map((t) => [t.id, t.logo_url as string | null]),
  );
  const regionalTeamDivision = new Map<string, string>();
  for (const t of regionalTeamRows ?? []) {
    const L = t.leagues as { division?: string } | { division?: string }[] | null | undefined;
    const div = Array.isArray(L) ? L[0]?.division : L?.division;
    if (typeof div === "string" && div.trim()) regionalTeamDivision.set(t.id, div.trim());
  }

  const [nationsLeague, goldCup, worldCup, clEntries, clFixturesRaw, , honoursPayload, cupHonoursPayload] =
    await Promise.all([
    getIntl("nations_league"),
    getIntl("gold_cup"),
    getIntl("world_cup"),
    selectedSeason
      ? supabase
          .from("tournament_entries")
          .select("team_id, qualified_via, teams(name, logo_url)")
          .in(
            "tournament_id",
            (
              await supabase
                .from("tournaments")
                .select("id")
                .eq("slug", "champions_league")
                .eq("season_id", (
                  await supabase
                    .from("seasons")
                    .select("id")
                    .eq("label", selectedSeason)
                    .maybeSingle()
                ).data?.id ?? "")
            ).data?.map((t) => t.id) ?? [],
          )
      : Promise.resolve({ data: [] as any[] }),
    selectedSeason
      ? supabase
          .from("fixtures")
          .select(
            "id, week, cup_round, status, home_score, away_score, home_team_id, away_team_id, score_detail",
          )
          .eq("season_label", selectedSeason)
          .eq("competition", "champions_league")
          .order("week")
      : Promise.resolve({
          data: [] as {
            id: string;
            week: number;
            cup_round: string | null;
            status: string;
            home_score: number | null;
            away_score: number | null;
            home_team_id: string;
            away_team_id: string;
            score_detail?: { displayLine?: string } | null;
          }[],
        }),
    selectedSeason
      ? supabase
          .from("player_international_stats")
          .select("player_id, caps, goals_for_country, saves_for_country, average_rating, players(name, role, profile_pic_url, teams(name, logo_url))")
          .eq("season_label", selectedSeason)
      : Promise.resolve({ data: [] as any[] }),
    honoursView && nav.group === "leagues" ?
      fetchDomesticRollOfHonourForCountry(supabase, capitalize(nav.sub))
    :     honoursView && nav.group === "cl" ?
      fetchChampionsLeagueRollFromFixtures(supabase)
    : honoursView && nav.group === "international" ?
      fetchInternationalRollOfHonour(
        supabase,
        nav.sub === "nations-league" ?
          "nations_league"
        : nav.sub === "gold-cup" ?
          "gold_cup"
        : "world_cup",
      )
    : Promise.resolve(null),
    honoursView && nav.group === "leagues"
      ? fetchDomesticCupRoll(supabase, capitalize(nav.sub))
      : Promise.resolve(null),
  ]);

  let clSavedMatchLeaderboards: {
    topScorers: { playerId: string; goals: number; name: string }[];
    topSavers: { playerId: string; saves: number; name: string }[];
  } | null = null;
  if (selectedSeason && nav.group === "cl" && !honoursView) {
    try {
      const raw = await fetchSeasonSavedMatchLeaderboards(supabase, {
        seasonLabel: selectedSeason,
        competition: "champions_league",
        limit: 8,
      });
      const ids = [
        ...new Set([
          ...raw.topScorers.map((x) => x.playerId),
          ...raw.topSavers.map((x) => x.playerId),
        ]),
      ];
      const { data: pls } =
        ids.length === 0 ?
          { data: [] as { id: string; name: string }[] }
        : await supabase.from("players").select("id, name").in("id", ids);
      const nm = new Map((pls ?? []).map((p) => [p.id, p.name]));
      clSavedMatchLeaderboards = {
        topScorers: raw.topScorers.map((r) => ({
          ...r,
          name: nm.get(r.playerId) ?? r.playerId,
        })),
        topSavers: raw.topSavers.map((r) => ({
          ...r,
          name: nm.get(r.playerId) ?? r.playerId,
        })),
      };
    } catch {
      clSavedMatchLeaderboards = null;
    }
  }

  let dashGoalSaveLeaderboards: {
    topScorers: {
      playerId: string;
      goals: number;
      name: string;
      role: string | null;
      pic: string | null;
      team: string | null;
      logo: string | null;
    }[];
    topSavers: {
      playerId: string;
      saves: number;
      name: string;
      role: string | null;
      pic: string | null;
      team: string | null;
      logo: string | null;
    }[];
  } | null = null;
  if (selectedSeason && nav.group === "rankings") {
    try {
      const raw = await fetchSeasonSavedMatchLeaderboards(supabase, {
        seasonLabel: selectedSeason,
        limit: 12,
      });
      const ids = [
        ...new Set([
          ...raw.topScorers.map((x) => x.playerId),
          ...raw.topSavers.map((x) => x.playerId),
        ]),
      ];
      const { data: pls } =
        ids.length === 0 ?
          { data: [] as Record<string, unknown>[] }
        : await supabase
            .from("players")
            .select("id, name, role, profile_pic_url, teams(name, logo_url)")
            .in("id", ids);
      const pmap = new Map(
        (pls ?? []).map((p) => {
          const t = p.teams as { name?: string; logo_url?: string | null } | null;
          return [
            p.id as string,
            {
              name: p.name as string,
              role: p.role as string | null,
              pic: (p.profile_pic_url as string | null) ?? null,
              team: t?.name ?? null,
              logo: t?.logo_url ?? null,
            },
          ];
        }),
      );
      dashGoalSaveLeaderboards = {
        topScorers: raw.topScorers.map((r) => {
          const m = pmap.get(r.playerId);
          return {
            playerId: r.playerId,
            goals: r.goals,
            name: m?.name ?? r.playerId,
            role: m?.role ?? null,
            pic: m?.pic ?? null,
            team: m?.team ?? null,
            logo: m?.logo ?? null,
          };
        }),
        topSavers: raw.topSavers.map((r) => {
          const m = pmap.get(r.playerId);
          return {
            playerId: r.playerId,
            saves: r.saves,
            name: m?.name ?? r.playerId,
            role: m?.role ?? null,
            pic: m?.pic ?? null,
            team: m?.team ?? null,
            logo: m?.logo ?? null,
          };
        }),
      };
    } catch {
      dashGoalSaveLeaderboards = null;
    }
  }

  const upcomingTeamIds = [
    ...new Set(
      (data?.upcoming ?? [])
        .filter((m): m is DashboardUpcomingClub => m.kind === "club")
        .flatMap((m) => [m.homeTeamId, m.awayTeamId]),
    ),
  ];
  const { data: dashSchedTeams } =
    upcomingTeamIds.length > 0 ?
      await supabase
        .from("teams")
        .select("id, name, logo_url")
        .in("id", upcomingTeamIds)
    : { data: [] as { id: string; name: string; logo_url: string | null }[] };
  const dashSchedById = new Map((dashSchedTeams ?? []).map((t) => [t.id, t]));

  const clFxList = clFixturesRaw.data ?? [];
  const clFxTeamIds = [...new Set(clFxList.flatMap((f) => [f.home_team_id, f.away_team_id]))];
  const { data: clFxTeams } =
    clFxTeamIds.length > 0 ?
      await supabase.from("teams").select("id, name, logo_url").in("id", clFxTeamIds)
    : { data: [] as { id: string; name: string; logo_url: string | null }[] };
  const clTeamById = new Map((clFxTeams ?? []).map((t) => [t.id, t]));

  const seasonQ = encodeURIComponent(selectedSeason);
  const hv = honoursView;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-col gap-4 border-b border-slate-300/80 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-md ring-1 ring-emerald-900/20">
            <LayoutDashboard className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Matchday dashboard
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span className="font-medium">
                Viewing season{" "}
                <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-slate-800">
                  {selectedSeason}
                </span>
              </span>
              <form action="/dashboard" className="flex items-center gap-2">
                <input type="hidden" name="group" value={nav.group} />
                {nav.group === "leagues" ?
                  <input type="hidden" name="sub" value={nav.sub} />
                : null}
                {nav.group === "international" ?
                  <input type="hidden" name="sub" value={nav.sub} />
                : null}
                {honoursView ?
                  <input type="hidden" name="view" value="honours" />
                : null}
                <select
                  name="season"
                  defaultValue={selectedSeason}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                >
                  {(seasons ?? []).map((s) => (
                    <option key={s.label} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                  {!seasons?.some((s) => s.label === selectedSeason) && (
                    <option value={selectedSeason}>{selectedSeason}</option>
                  )}
                </select>
                <button className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm font-semibold">
                  Go
                </button>
              </form>
              <span className="text-slate-400">·</span>
              <span className="font-medium">Live tables · Fixture list · Club finance wire</span>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div
          className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </div>
      )}

      {data?.scheduleWarnings && data.scheduleWarnings.length > 0 && (
        <ul className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {data.scheduleWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <nav className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
            View
          </span>
          <Link
            href={dashHref(selectedSeason, { group: "leagues", sub: "england" }, hv)}
            className={tabClass(nav.group === "leagues")}
          >
            Leagues
          </Link>
          <Link
            href={dashHref(selectedSeason, { group: "cl", sub: null }, hv)}
            className={`${tabClass(nav.group === "cl")} inline-flex items-center gap-1.5`}
          >
            <CompetitionBrandLogo slug="champions_league" className="h-4 w-4" />
            Champions League
          </Link>
          <Link
            href={dashHref(selectedSeason, { group: "international", sub: "nations-league" }, hv)}
            className={`${tabClass(nav.group === "international")} inline-flex items-center gap-1.5`}
          >
            <CompetitionBrandLogo slug="nations_league" className="h-4 w-4" />
            International
          </Link>
          <Link
            href={`/dashboard?${buildDashboardQuery({ season: selectedSeason, nav: { group: "rankings", sub: null } })}`}
            className={tabClass(nav.group === "rankings")}
          >
            Rankings
          </Link>
        </div>
        {nav.group === "leagues" && (
          <div className="flex flex-wrap items-center gap-2 border-l-2 border-emerald-400/80 pl-3">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
              Country
            </span>
            {(["england", "spain", "france"] as const).map((c) => (
              <Link
                key={c}
                href={dashHref(selectedSeason, { group: "leagues", sub: c }, hv)}
                className={tabClass(nav.sub === c)}
              >
                {(countryFlag.get(c) ?? "🏳️")} {capitalize(c)}
              </Link>
            ))}
          </div>
        )}
        {nav.group === "international" && (
          <div className="flex flex-wrap items-center gap-2 border-l-2 border-indigo-400/80 pl-3">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
              Competition
            </span>
            {(
              [
                { id: "nations-league" as const, label: "Nations League", slug: "nations_league" as const },
                { id: "gold-cup" as const, label: "Gold Cup", slug: "gold_cup" as const },
                { id: "world-cup" as const, label: "World Cup", slug: "world_cup" as const },
              ] as const
            ).map((x) => (
              <Link
                key={x.id}
                href={dashHref(selectedSeason, { group: "international", sub: x.id }, hv)}
                className={`${tabClass(nav.sub === x.id)} inline-flex items-center gap-1.5`}
              >
                <CompetitionBrandLogo slug={x.slug} className="h-4 w-4" />
                {x.label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      {(nav.group === "leagues" || nav.group === "cl" || nav.group === "international") && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/90 bg-gradient-to-r from-amber-50/90 to-white px-4 py-3 shadow-sm">
          <Trophy className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-600">
            View
          </span>
          <Link
            href={`/dashboard?${buildDashboardQuery({ season: selectedSeason, nav })}`}
            className={tabClass(!honoursView)}
          >
            Live season
          </Link>
          <Link
            href={`/dashboard?${buildDashboardQuery({ season: selectedSeason, nav, view: "honours" })}`}
            className={tabClass(honoursView)}
          >
            Past winners
          </Link>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            <span className="h-px flex-1 bg-slate-300" />
            <span className="flex shrink-0 items-center gap-2">
              {nav.group === "cl" && (
                <CompetitionBrandLogo slug="champions_league" className="h-7 w-7" title="Champions League" />
              )}
              {nav.group === "international" && (
                <CompetitionBrandLogo
                  slug={internationalSubToSlug(nav.sub)}
                  className="h-7 w-7"
                />
              )}
              {honoursView && (nav.group === "leagues" || nav.group === "cl" || nav.group === "international") ?
                "Past winners"
              : <>
                  {nav.group === "leagues" && "Domestic leagues"}
                  {nav.group === "cl" && "Champions League"}
                  {nav.group === "international" &&
                    (nav.sub === "nations-league" ?
                      "Nations League"
                    : nav.sub === "gold-cup" ?
                      "Gold Cup"
                    : "World Cup")}
                  {nav.group === "rankings" && "Goal & save leaderboards"}
                </>
              }
            </span>
            <span className="h-px flex-1 bg-slate-300" />
          </h2>
          <div className="flex flex-col gap-8">
            {nav.group === "leagues" && honoursView && Array.isArray(honoursPayload) && (
              <section className="rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-600">
                  Champions and runners-up from completed league fixtures (all seasons with results). Tiebreaks match live
                  tables except goalkeeper saves are not reloaded for history.
                </p>
                {(honoursPayload as Awaited<ReturnType<typeof fetchDomesticRollOfHonourForCountry>>).length === 0 ?
                  <p className="mt-4 text-sm text-slate-500">No completed league history for this country yet.</p>
                : (
                  <div className="mt-4 flex flex-col gap-6">
                    {(honoursPayload as Awaited<ReturnType<typeof fetchDomesticRollOfHonourForCountry>>).map((block) => (
                      <div key={block.leagueId}>
                        <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800">
                          {block.leagueLogoUrl ?
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={block.leagueLogoUrl}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-lg border border-slate-200/80 bg-white object-contain p-0.5 shadow-sm"
                            />
                          : null}
                          <span className="min-w-0 truncate">{block.leagueName}</span>
                          <span className="shrink-0 rounded-md bg-slate-200/80 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-700">
                            {block.division}
                          </span>
                        </h3>
                        {block.rows.length === 0 ?
                          <p className="text-sm text-slate-500">No finished seasons for this division.</p>
                        : (
                          <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full min-w-[520px] text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                  <th className="px-3 py-2">Season</th>
                                  <th className="px-3 py-2">Champion</th>
                                  <th className="px-3 py-2">Runner-up</th>
                                </tr>
                              </thead>
                              <tbody>
                                {block.rows.map((r) => (
                                  <tr key={r.seasonLabel} className="border-t border-slate-100">
                                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.seasonLabel}</td>
                                    <td className="px-3 py-2">
                                      <Link
                                        href={`/team/${r.winner.id}`}
                                        className="inline-flex items-center gap-2 font-bold text-slate-900 hover:text-emerald-700 hover:underline"
                                      >
                                        {r.winner.logoUrl ?
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={r.winner.logoUrl}
                                            alt=""
                                            className="h-6 w-6 rounded-md border border-slate-200/70 bg-white object-contain p-px shadow-sm"
                                          />
                                        : null}
                                        {r.winner.name}
                                      </Link>
                                    </td>
                                    <td className="px-3 py-2">
                                      {r.runnerUp ?
                                        <Link
                                          href={`/team/${r.runnerUp.id}`}
                                          className="inline-flex items-center gap-2 font-semibold text-slate-800 hover:text-emerald-700 hover:underline"
                                        >
                                          {r.runnerUp.logoUrl ?
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={r.runnerUp.logoUrl}
                                              alt=""
                                              className="h-6 w-6 rounded-md border border-slate-200/70 bg-white object-contain p-px shadow-sm"
                                            />
                                          : null}
                                          {r.runnerUp.name}
                                        </Link>
                                      : <span className="text-slate-400">—</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {(cupHonoursPayload as DomesticCupRoll | null) && (() => {
                  const cup = cupHonoursPayload as DomesticCupRoll;
                  return (
                    <div className="mt-6 border-t border-slate-200 pt-5">
                      <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800">
                        {cup.cupLogoUrl ?
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cup.cupLogoUrl}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-lg border border-slate-200/80 bg-white object-contain p-0.5 shadow-sm"
                          />
                        : null}
                        <span className="min-w-0 truncate">{cup.cupName}</span>
                        <span className="shrink-0 rounded-md bg-indigo-100/80 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-indigo-700">
                          Cup
                        </span>
                      </h3>
                      {cup.rows.length === 0 ?
                        <p className="text-sm text-slate-500">No completed cup finals yet.</p>
                      : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full min-w-[520px] text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                <th className="px-3 py-2">Season</th>
                                <th className="px-3 py-2">Winner</th>
                                <th className="px-3 py-2">Runner-up</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cup.rows.map((r) => (
                                <tr key={r.seasonLabel} className="border-t border-slate-100">
                                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.seasonLabel}</td>
                                  <td className="px-3 py-2">
                                    <Link
                                      href={`/team/${r.winner.id}`}
                                      className="inline-flex items-center gap-2 font-bold text-slate-900 hover:text-emerald-700 hover:underline"
                                    >
                                      {r.winner.logoUrl ?
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={r.winner.logoUrl}
                                          alt=""
                                          className="h-6 w-6 rounded-md border border-slate-200/70 bg-white object-contain p-px shadow-sm"
                                        />
                                      : null}
                                      {r.winner.name}
                                    </Link>
                                  </td>
                                  <td className="px-3 py-2">
                                    {r.runnerUp ?
                                      <Link
                                        href={`/team/${r.runnerUp.id}`}
                                        className="inline-flex items-center gap-2 font-semibold text-slate-800 hover:text-emerald-700 hover:underline"
                                      >
                                        {r.runnerUp.logoUrl ?
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={r.runnerUp.logoUrl}
                                            alt=""
                                            className="h-6 w-6 rounded-md border border-slate-200/70 bg-white object-contain p-px shadow-sm"
                                          />
                                        : null}
                                        {r.runnerUp.name}
                                      </Link>
                                    : <span className="text-slate-400">—</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </section>
            )}
            {nav.group === "leagues" && !honoursView && (
              <section>
                {(() => {
                  const country = capitalize(nav.sub);
                  const countryTables = tablesByCountry.get(country) ?? [];
                  return (
                    <>
                      <h3 className="mb-3 rounded-xl border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-black uppercase tracking-wider text-slate-700">
                        {(countryFlag.get(nav.sub) ?? "🏳️")} {country}
                      </h3>
                      <div className="flex flex-col gap-4">
                        {countryTables.map((t) => (
                    <div
                      key={t.leagueId}
                      className="overflow-hidden rounded-2xl border border-slate-300/90 bg-white shadow-sm"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="inline-flex min-w-0 items-center gap-2 font-bold text-slate-900">
                            {t.leagueLogoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={t.leagueLogoUrl}
                                alt=""
                                className="h-8 w-8 shrink-0 rounded-lg border border-slate-200/80 bg-white object-contain p-0.5 shadow-sm"
                              />
                            ) : null}
                            <span className="truncate">{t.leagueName}</span>
                          </span>
                          <span className="shrink-0 rounded-md bg-slate-200/80 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-700">
                            {t.division}
                          </span>
                        </div>
                        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                          Domestic
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                              <th className="px-4 py-2.5">Pos</th>
                              <th className="px-4 py-2.5">Club</th>
                              <th className="px-4 py-2.5 text-center">P</th>
                              <th className="px-4 py-2.5 text-center">W</th>
                              <th className="px-4 py-2.5 text-center">D</th>
                              <th className="px-4 py-2.5 text-center">L</th>
                              <th className="px-4 py-2.5 text-right">GD</th>
                              <th className="px-4 py-2.5 text-right">Pts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.standings.map((row, i) => (
                              <tr
                                key={row.teamId}
                                className={domesticStandingRowClass(t.division, i)}
                              >
                                <td className="px-4 py-2.5 font-mono text-slate-500">
                                  {i + 1}
                                </td>
                                <td className="px-4 py-2.5">
                                  <Link
                                    href={`/team/${row.teamId}`}
                                    className="inline-flex items-center gap-2 font-bold text-slate-900 hover:text-emerald-700 hover:underline"
                                  >
                                    {row.teamLogoUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={row.teamLogoUrl}
                                        alt=""
                                        className="h-7 w-7 shrink-0 rounded-md object-contain"
                                        decoding="async"
                                      />
                                    ) : (
                                      <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-200 text-[10px] font-black text-slate-600">
                                        {row.teamName.slice(0, 1)}
                                      </span>
                                    )}
                                    {row.teamName}
                                  </Link>
                                </td>
                                <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">
                                  {row.played}
                                </td>
                                <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">{row.won}</td>
                                <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">{row.drawn}</td>
                                <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">{row.lost}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{row.goalDiff >= 0 ? `+${row.goalDiff}` : row.goalDiff}</td>
                                <td className="px-4 py-2.5 text-right text-base font-extrabold tabular-nums text-slate-900">
                                  {row.points}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                        ))}
                        <div className="rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-600">
                          <p className="mb-2 font-semibold text-slate-700">Row colours</p>
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex overflow-hidden rounded-md border border-emerald-200 bg-emerald-50 shadow-sm">
                              <span className="w-1.5 shrink-0 bg-emerald-600" aria-hidden />
                              <span className="px-2 py-1.5 font-semibold text-emerald-950">
                                D1 1st · Title + CL
                              </span>
                            </span>
                            <span className="inline-flex overflow-hidden rounded-md border border-sky-200 bg-sky-50 shadow-sm">
                              <span className="w-1.5 shrink-0 bg-sky-600" aria-hidden />
                              <span className="px-2 py-1.5 font-semibold text-sky-950">D1 2nd · CL</span>
                            </span>
                            <span className="inline-flex overflow-hidden rounded-md border border-amber-200 bg-amber-50 shadow-sm">
                              <span className="w-1.5 shrink-0 bg-amber-600" aria-hidden />
                              <span className="px-2 py-1.5 font-semibold text-amber-950">
                                D1 4th · Relegation risk
                              </span>
                            </span>
                            <span className="inline-flex overflow-hidden rounded-md border border-emerald-200 bg-emerald-50 shadow-sm">
                              <span className="w-1.5 shrink-0 bg-emerald-600" aria-hidden />
                              <span className="px-2 py-1.5 font-semibold text-emerald-950">
                                D2 1st · Promotion slot
                              </span>
                            </span>
                          </div>
                          <p className="mt-2 text-slate-600">
                            Tiebreak rules (league): points → GD → saves → H2H → H2H vs 3rd team → coin toss.
                          </p>
                        </div>

                        <div className="space-y-3 border-t border-slate-200 pt-5">
                          {(() => {
                            const cupLogo = cupLogoForCountry(country);
                            const cupName = cupNameForCountry(country);
                            return (
                              <h4 className="flex flex-wrap items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900">
                                {cupLogo ?
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={cupLogo}
                                    alt={cupName}
                                    className="h-8 w-8 shrink-0 rounded-lg border border-slate-200/80 bg-white object-contain p-0.5 shadow-sm"
                                  />
                                : <Trophy className="h-4 w-4 shrink-0 text-indigo-600" />}
                                <span>{cupName}</span>
                              </h4>
                            );
                          })()}
                          <p className="text-xs text-slate-600">
                            Cup ties are <code className="rounded bg-slate-100 px-1 font-mono">regional_cup</code>{" "}
                            fixtures. Quarter-finals are created from <strong>Season maker</strong>; further rounds
                            appear as you add SF/F rows or extend the schedule. The bracket groups ties by{" "}
                            <span className="font-mono">cup_round</span> (QF → SF → F).
                          </p>
                          {(regionalCupRaw ?? []).length === 0 ?
                            <p className="text-sm text-slate-500">
                              No regional cup fixtures for {country} this season yet.
                            </p>
                          : (
                            <RegionalCupBracket
                              fixtures={(regionalCupRaw ?? []).map((f) => ({
                                ...f,
                                scoreDisplay:
                                  typeof (f.score_detail as { displayLine?: string } | null)?.displayLine === "string"
                                    ? (f.score_detail as { displayLine: string }).displayLine
                                    : null,
                              }))}
                              teamName={regionalTeamName}
                              teamLogo={regionalTeamLogo}
                              teamDivision={regionalTeamDivision}
                            />
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </section>
            )}
            {nav.group === "cl" && honoursView && Array.isArray(honoursPayload) && (
              <section className="rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white p-0.5 shadow-sm">
                    <CompetitionBrandLogo slug="champions_league" className="h-6 w-6" />
                  </span>
                  <span className="text-sm font-black uppercase tracking-wide text-slate-800">
                    Champions League finals
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  Winner and runner-up come from each season&apos;s completed{" "}
                  <code className="rounded bg-slate-100 px-1 font-mono text-xs">CL_F</code> final in{" "}
                  <code className="rounded bg-slate-100 px-1 font-mono text-xs">fixtures</code> (scores after extra time
                  if the tie went past regulation).
                </p>
                {(honoursPayload as Awaited<ReturnType<typeof fetchChampionsLeagueRollFromFixtures>>).length === 0 ?
                  <p className="mt-4 text-sm text-slate-500">
                    No completed Champions League finals on record for this database. Play the{" "}
                    <code className="rounded bg-slate-100 px-1 font-mono text-xs">CL_F</code> fixture in Matchday or
                    seed finals from Admin.
                  </p>
                : (
                  <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-3 py-2">Season</th>
                          <th className="px-3 py-2">Winner</th>
                          <th className="px-3 py-2">Runner-up</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(honoursPayload as Awaited<ReturnType<typeof fetchChampionsLeagueRollFromFixtures>>).map(
                          (r) => (
                            <tr key={r.seasonLabel} className="border-t border-slate-100">
                              <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.seasonLabel}</td>
                              <td className="px-3 py-2">
                                <Link
                                  href={`/team/${r.winner.id}`}
                                  className="inline-flex items-center gap-2 font-bold text-slate-900 hover:text-emerald-700 hover:underline"
                                >
                                  {r.winner.logoUrl ?
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={r.winner.logoUrl}
                                      alt=""
                                      className="h-6 w-6 rounded object-contain"
                                    />
                                  : null}
                                  {r.winner.name}
                                </Link>
                              </td>
                              <td className="px-3 py-2">
                                {r.runnerUp ?
                                  <Link
                                    href={`/team/${r.runnerUp.id}`}
                                    className="inline-flex items-center gap-2 text-slate-800 hover:text-emerald-700 hover:underline"
                                  >
                                    {r.runnerUp.logoUrl ?
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={r.runnerUp.logoUrl}
                                        alt=""
                                        className="h-6 w-6 rounded object-contain"
                                      />
                                    : null}
                                    {r.runnerUp.name}
                                  </Link>
                                : <span className="text-slate-400">—</span>}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
            {nav.group === "cl" && !honoursView && (
              <section className="rounded-2xl border border-slate-300/90 bg-white p-4 shadow-sm">
                <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <CompetitionBrandLogo slug="champions_league" className="h-9 w-9" />
                  Champions League
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Qualified clubs, live group tables, and the knockout path to the final (same layout style as
                  international knockouts).
                </p>
                {selectedSeason ?
                  <p className="mt-2">
                    <Link
                      href={`/leaderboards?season=${encodeURIComponent(selectedSeason)}&scope=champions_league`}
                      className="text-sm font-bold text-emerald-800 hover:underline"
                    >
                      Matchday leaderboards (every league &amp; cup) →
                    </Link>
                  </p>
                : null}
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(clEntries.data ?? []).map((e: any, idx: number) => {
                    const t = Array.isArray(e.teams) ? e.teams[0] : e.teams;
                    return (
                      <li
                        key={`${e.team_id}-${idx}`}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm"
                      >
                        <Link
                          href={`/team/${e.team_id}`}
                          className="inline-flex min-w-0 items-center gap-2 font-semibold hover:text-emerald-800 hover:underline"
                        >
                          {t?.logo_url ?
                            <img
                              src={t.logo_url}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-md object-contain"
                              decoding="async"
                            />
                          : null}
                          <span className="truncate">{t?.name ?? e.team_id}</span>
                        </Link>
                        <span className="shrink-0 text-xs text-slate-500">{e.qualified_via ?? "Qualified"}</span>
                      </li>
                    );
                  })}
                </ul>
                {clFxList.length > 0 ?
                  <div className="mt-6">
                    <ChampionsLeagueTournamentBoard fixtures={clFxList} teamById={clTeamById} />
                  </div>
                : (
                  <p className="mt-4 text-sm text-slate-500">
                    No Champions League fixtures yet. After league games finish, seed entries (season end or seed controls
                    below) to create the group schedule.
                  </p>
                )}
                {selectedSeason ?
                  <ChampionsLeagueSeedControls seasonLabel={selectedSeason} />
                : null}
                {clSavedMatchLeaderboards &&
                (clSavedMatchLeaderboards.topScorers.length > 0 ||
                  clSavedMatchLeaderboards.topSavers.length > 0) ?
                  <div className="mt-6 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        CL — goals (saved Matchday)
                      </h4>
                      <ol className="mt-2 space-y-1.5 text-sm">
                        {clSavedMatchLeaderboards.topScorers.map((r, i) => (
                          <li key={r.playerId} className="flex justify-between gap-2">
                            <span className="text-slate-500">{i + 1}.</span>
                            <Link
                              href={`/player/${r.playerId}`}
                              className="min-w-0 flex-1 truncate font-semibold text-slate-900 hover:text-emerald-800 hover:underline"
                            >
                              {r.name}
                            </Link>
                            <span className="shrink-0 font-mono tabular-nums text-slate-700">{r.goals}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        CL — saves (saved Matchday)
                      </h4>
                      <ol className="mt-2 space-y-1.5 text-sm">
                        {clSavedMatchLeaderboards.topSavers.map((r, i) => (
                          <li key={r.playerId} className="flex justify-between gap-2">
                            <span className="text-slate-500">{i + 1}.</span>
                            <Link
                              href={`/player/${r.playerId}`}
                              className="min-w-0 flex-1 truncate font-semibold text-slate-900 hover:text-emerald-800 hover:underline"
                            >
                              {r.name}
                            </Link>
                            <span className="shrink-0 font-mono tabular-nums text-slate-700">{r.saves}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                : selectedSeason && nav.group === "cl" && !honoursView ?
                  <p className="mt-4 text-xs text-slate-500">
                    Saved Matchday leaderboards appear after you complete CL fixtures with goals/saves stored in match
                    reports (new matches only).
                  </p>
                : null}
              </section>
            )}
            {nav.group === "international" && honoursView && Array.isArray(honoursPayload) && (
              <section className="rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-600">
                  Winner and runner-up from each season&apos;s completed <strong>final</strong> (stage F) in the
                  international fixture layer.
                </p>
                {(honoursPayload as Awaited<ReturnType<typeof fetchInternationalRollOfHonour>>).length === 0 ?
                  <p className="mt-4 text-sm text-slate-500">
                    No completed finals on record for this tournament yet.
                  </p>
                : (
                  <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-3 py-2">Season</th>
                          <th className="px-3 py-2">Winner</th>
                          <th className="px-3 py-2">Runner-up</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(honoursPayload as Awaited<ReturnType<typeof fetchInternationalRollOfHonour>>).map((r) => (
                          <tr key={r.seasonLabel} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.seasonLabel}</td>
                            <td className="px-3 py-2 font-semibold text-slate-900">
                              <span className="mr-1.5">{r.winner.flag}</span>
                              {r.winner.name}
                            </td>
                            <td className="px-3 py-2 text-slate-800">
                              {r.runnerUp ?
                                <>
                                  <span className="mr-1.5">{r.runnerUp.flag}</span>
                                  {r.runnerUp.name}
                                </>
                              : <span className="text-slate-400">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
            {nav.group === "international" && !honoursView && (
              <section className="rounded-2xl border border-slate-300/90 bg-white p-4 shadow-sm">
                {(() => {
                  const dataset =
                    nav.sub === "nations-league"
                      ? nationsLeague
                      : nav.sub === "gold-cup"
                        ? goldCup
                        : worldCup;
                  const intlSlug =
                    nav.sub === "nations-league" ? "nations_league"
                    : nav.sub === "gold-cup" ? "gold_cup"
                    : "world_cup";
                  return (
                    <>
                      {selectedSeason ?
                        <InternationalTournamentActionBar
                          className="mb-4 mt-0 border-indigo-200/90 bg-gradient-to-br from-indigo-50/60 to-white"
                          slug={intlSlug}
                          seasonLabel={selectedSeason}
                          previewEnabled={previewEnabled}
                        />
                      : null}
                      <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                        <CompetitionBrandLogo
                          slug={internationalSubToSlug(nav.sub)}
                          className="h-9 w-9"
                        />
                        {nav.sub === "nations-league"
                          ? "Nations League"
                          : nav.sub === "gold-cup"
                            ? "Gold Cup"
                            : "World Cup"}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Tiebreak rules (tournament): points → GD → H2H → saves → H2H vs 3rd team → coin toss.
                      </p>
                      <p className="mt-2 text-xs text-slate-600">
                        <span className="inline-flex overflow-hidden rounded-md border border-sky-200 bg-sky-50">
                          <span className="w-1 shrink-0 bg-sky-600" aria-hidden />
                          <span className="px-2 py-0.5 font-semibold text-sky-950">Top two · Knockouts</span>
                        </span>
                      </p>
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div className="overflow-hidden rounded-xl border border-slate-200">
                          {dataset.groupTables?.length ? (
                            <div className="space-y-3 p-3">
                              {dataset.groupTables.map((g: any) => (
                                <div key={g.group} className="overflow-hidden rounded-lg border border-slate-200">
                                  <div className="bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                                    Group {g.group}
                                  </div>
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                                        <th className="px-3 py-2">Pos</th><th className="px-3 py-2">Team</th><th className="px-3 py-2 text-right">P</th><th className="px-3 py-2 text-right">Pts</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {g.table.map((r: any, i: number) => (
                                        <tr
                                          key={r.teamId}
                                          className={`border-t border-slate-100 ${internationalGroupStandingRowClass(i)}`}
                                        >
                                          <td className="px-3 py-2">{i + 1}</td>
                                          <td className="px-3 py-2 font-semibold">
                                            {r.countryCode ?
                                              <Link
                                                href={`/countries/${r.countryCode}`}
                                                className="hover:text-emerald-800 hover:underline"
                                              >
                                                {r.flag} {r.name}
                                              </Link>
                                            : <>
                                                {r.flag} {r.name}
                                              </>
                                            }
                                          </td>
                                          <td className="px-3 py-2 text-right">{r.played}</td>
                                          <td className="px-3 py-2 text-right font-black">{r.points}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                  <th className="px-3 py-2">Pos</th><th className="px-3 py-2">Team</th><th className="px-3 py-2 text-right">P</th><th className="px-3 py-2 text-right">Pts</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dataset.table.map((r: any, i: number) => (
                                  <tr
                                    key={r.teamId}
                                    className={`border-t border-slate-100 ${internationalGroupStandingRowClass(i)}`}
                                  >
                                    <td className="px-3 py-2">{i + 1}</td>
                                    <td className="px-3 py-2 font-semibold">
                                      {r.countryCode ?
                                        <Link
                                          href={`/countries/${r.countryCode}`}
                                          className="hover:text-emerald-800 hover:underline"
                                        >
                                          {r.flag} {r.name}
                                        </Link>
                                      : <>
                                          {r.flag} {r.name}
                                        </>
                                      }
                                    </td>
                                    <td className="px-3 py-2 text-right">{r.played}</td>
                                    <td className="px-3 py-2 text-right font-black">{r.points}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                        <ul className="max-h-96 overflow-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                          {dataset.fixtures.map((f: any) => (
                            <li key={f.id} className="px-3 py-2 text-sm">
                              <p className="text-xs text-slate-500">
                                {formatFixtureCalendarLabel(
                                  f.week,
                                  nav.sub === "world-cup" ? "world_cup" : "international",
                                )}
                                {f.stage && f.stage !== "group" ?
                                  <span className="ml-2 font-bold text-indigo-700">
                                    · {String(f.stage).toUpperCase()}
                                  </span>
                                : null}
                              </p>
                              <p className="font-semibold">
                                {f.homeCode ?
                                  <Link
                                    href={`/countries/${f.homeCode}`}
                                    className="hover:underline"
                                  >
                                    {f.homeFlag} {f.home}
                                  </Link>
                                : <>
                                    {f.homeFlag} {f.home}
                                  </>
                                }{" "}
                                {f.status === "completed" ? `${f.home_score}-${f.away_score}` : "vs"}{" "}
                                {f.awayCode ?
                                  <Link
                                    href={`/countries/${f.awayCode}`}
                                    className="hover:underline"
                                  >
                                    {f.awayFlag} {f.away}
                                  </Link>
                                : <>
                                    {f.awayFlag} {f.away}
                                  </>
                                }
                              </p>
                            </li>
                          ))}
                        </ul>
                        {(() => {
                          const ko = (dataset.fixtures as any[]).filter(
                            (f) => f.stage && f.stage !== "group",
                          );
                          if (ko.length === 0) return null;
                          const sorted = [...ko].sort(
                            (a, b) => a.week - b.week || String(a.stage).localeCompare(String(b.stage)),
                          );
                          return (
                            <div className="lg:col-span-2">
                              <IntlKnockoutBracket fixtures={sorted} />
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  );
                })()}
              </section>
            )}
            {nav.group === "rankings" && (
              <section className="rounded-2xl border border-slate-300/90 bg-white p-4 shadow-sm sm:p-6">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Goal &amp; save leaderboards</h3>
                    <p className="mt-1 max-w-xl text-sm text-slate-600">
                      From saved Matchday games this season (all competitions). Use the full page for league / cup
                      filters.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/leaderboards?season=${encodeURIComponent(selectedSeason)}`}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-900 hover:bg-emerald-100"
                    >
                      Filters &amp; scope →
                    </Link>
                    <Link
                      href={`/rankings?season=${encodeURIComponent(selectedSeason)}&role=all&scope=career&sort=market_value`}
                      className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
                      >
                      Player rankings →
                    </Link>
                  </div>
                </div>
                {!dashGoalSaveLeaderboards ?
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600">
                    Could not load leaderboards.
                  </p>
                : (
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="overflow-hidden rounded-2xl border border-emerald-200/90 bg-gradient-to-b from-white to-emerald-50/40 shadow-sm">
                      <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50/80 px-4 py-3">
                        <Goal className="h-5 w-5 text-emerald-700" />
                        <h4 className="text-sm font-black uppercase tracking-wide text-emerald-950">
                          Top scorers
                        </h4>
                      </div>
                      <ol className="divide-y divide-emerald-100/80">
                        {dashGoalSaveLeaderboards.topScorers.length === 0 ?
                          <li className="px-4 py-8 text-center text-sm text-slate-500">
                            No goal data yet — complete matches from Matchday with saved reports.
                          </li>
                        : dashGoalSaveLeaderboards.topScorers.map((r, i) => (
                            <li key={r.playerId}>
                              <Link
                                href={`/player/${r.playerId}`}
                                className="flex items-center gap-3 px-4 py-3 transition hover:bg-emerald-50/90"
                              >
                                <span className="w-7 shrink-0 text-center font-mono text-sm font-bold text-emerald-700">
                                  {i + 1}
                                </span>
                                <PlayerAvatar name={r.name} profilePicUrl={r.pic} sizeClassName="h-10 w-10 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-bold text-slate-900">{r.name}</p>
                                  <p className="flex min-w-0 items-center gap-2 text-xs text-slate-600">
                                    {r.logo ?
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={r.logo} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
                                    : null}
                                    <span className="truncate">{r.team ?? "—"}</span>
                                    {r.role ?
                                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">
                                        {r.role}
                                      </span>
                                    : null}
                                  </p>
                                </div>
                                <span className="shrink-0 font-mono text-lg font-black tabular-nums text-emerald-900">
                                  {r.goals}
                                </span>
                              </Link>
                            </li>
                          ))
                        }
                      </ol>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-sky-200/90 bg-gradient-to-b from-white to-sky-50/40 shadow-sm">
                      <div className="flex items-center gap-2 border-b border-sky-100 bg-sky-50/80 px-4 py-3">
                        <Shield className="h-5 w-5 text-sky-700" />
                        <h4 className="text-sm font-black uppercase tracking-wide text-sky-950">
                          Top keepers (saves)
                        </h4>
                      </div>
                      <ol className="divide-y divide-sky-100/80">
                        {dashGoalSaveLeaderboards.topSavers.length === 0 ?
                          <li className="px-4 py-8 text-center text-sm text-slate-500">
                            No save data yet.
                          </li>
                        : dashGoalSaveLeaderboards.topSavers.map((r, i) => (
                            <li key={r.playerId}>
                              <Link
                                href={`/player/${r.playerId}`}
                                className="flex items-center gap-3 px-4 py-3 transition hover:bg-sky-50/90"
                              >
                                <span className="w-7 shrink-0 text-center font-mono text-sm font-bold text-sky-700">
                                  {i + 1}
                                </span>
                                <PlayerAvatar name={r.name} profilePicUrl={r.pic} sizeClassName="h-10 w-10 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-bold text-slate-900">{r.name}</p>
                                  <p className="flex min-w-0 items-center gap-2 text-xs text-slate-600">
                                    {r.logo ?
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={r.logo} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
                                    : null}
                                    <span className="truncate">{r.team ?? "—"}</span>
                                  </p>
                                </div>
                                <span className="shrink-0 font-mono text-lg font-black tabular-nums text-sky-900">
                                  {r.saves}
                                </span>
                              </Link>
                            </li>
                          ))
                        }
                      </ol>
                    </div>
                  </div>
                )}
              </section>
            )}
            {nav.group === "leagues" && !honoursView && data && data.tables.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-8 text-center text-sm text-slate-600">
                No tables yet. Run{" "}
                <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-xs">
                  npm run seed:domestic
                </code>{" "}
                then play matches to fill results.
              </p>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
              <Radio className="h-4 w-4 text-emerald-600" />
              Next up
            </h2>
            <ul className="space-y-3">
              {(data?.upcoming ?? []).length === 0 && (
                <li className="text-sm text-slate-500">No fixtures queued.</li>
              )}
              {(data?.upcoming ?? []).map((m) => {
                if (m.kind === "international") {
                  return (
                    <li
                      key={`intl-${m.id}`}
                      className="rounded-xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/70 to-white p-3"
                    >
                      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-indigo-800">
                        {m.weekLabel}
                        <span className="ml-2 font-semibold text-indigo-950">{m.competitionLabel}</span>
                      </p>
                      <div className="mt-2 flex flex-nowrap items-center gap-1.5 text-sm font-bold text-slate-900">
                        {m.homeCode ?
                          <Link
                            href={`/countries/${m.homeCode}`}
                            className="inline-flex min-w-0 items-center gap-1.5 hover:text-emerald-800 hover:underline"
                          >
                            <span className="shrink-0 text-base leading-none">{m.homeFlag}</span>
                            <span className="truncate">{m.homeName}</span>
                          </Link>
                        : <span className="inline-flex min-w-0 items-center gap-1.5">
                            <span className="shrink-0 text-base leading-none">{m.homeFlag}</span>
                            <span className="truncate">{m.homeName}</span>
                          </span>}
                        <span className="shrink-0 font-normal text-slate-400">v</span>
                        {m.awayCode ?
                          <Link
                            href={`/countries/${m.awayCode}`}
                            className="inline-flex min-w-0 items-center gap-1.5 hover:text-emerald-800 hover:underline"
                          >
                            <span className="shrink-0 text-base leading-none">{m.awayFlag}</span>
                            <span className="truncate">{m.awayName}</span>
                          </Link>
                        : <span className="inline-flex min-w-0 items-center gap-1.5">
                            <span className="shrink-0 text-base leading-none">{m.awayFlag}</span>
                            <span className="truncate">{m.awayName}</span>
                          </span>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link
                          href={`/matchday?intlFixtureId=${encodeURIComponent(m.id)}`}
                          className="inline-flex rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                        >
                          Play in Matchday →
                        </Link>
                        <Link
                          href={`/competitions/international/${m.competitionSlug}?season=${seasonQ}`}
                          className="inline-flex items-center text-xs font-semibold text-indigo-800 hover:underline"
                        >
                          Tournament page
                        </Link>
                      </div>
                    </li>
                  );
                }
                const h = dashSchedById.get(m.homeTeamId);
                const a = dashSchedById.get(m.awayTeamId);
                return (
                  <li
                    key={m.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-3"
                  >
                    <p className="flex flex-wrap items-center gap-3">
                      {m.useClBrand ?
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white p-0.5 shadow-sm">
                          <CompetitionBrandLogo slug="champions_league" className="h-6 w-6" />
                        </span>
                      : m.leagueLogoUrl ?
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.leagueLogoUrl}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-lg border border-slate-200/80 bg-white object-contain p-0.5 shadow-sm"
                        />
                      : null}
                      {m.countryFlagEmoji ?
                        <span className="text-lg leading-none" title="Host">
                          {m.countryFlagEmoji}
                        </span>
                      : null}
                      <span className="text-lg font-semibold tracking-tight text-slate-900">{m.weekLabel}</span>
                    </p>
                    <div className="mt-2 flex flex-nowrap items-center gap-1.5 text-sm font-bold text-slate-900">
                      <Link
                        href={`/team/${m.homeTeamId}`}
                        className="inline-flex min-w-0 items-center gap-1.5 hover:text-emerald-800 hover:underline"
                      >
                        {h?.logo_url ?
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={h.logo_url}
                            alt=""
                            className="h-5 w-5 shrink-0 rounded object-contain"
                          />
                        : null}
                        <span className="truncate">{m.homeName}</span>
                      </Link>
                      <span className="shrink-0 font-normal text-slate-400">v</span>
                      <Link
                        href={`/team/${m.awayTeamId}`}
                        className="inline-flex min-w-0 items-center gap-1.5 hover:text-emerald-800 hover:underline"
                      >
                        {a?.logo_url ?
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.logo_url}
                            alt=""
                            className="h-5 w-5 shrink-0 rounded object-contain"
                          />
                        : null}
                        <span className="truncate">{m.awayName}</span>
                      </Link>
                    </div>
                    <Link
                      href={`/matchday?homeTeamId=${m.homeTeamId}&awayTeamId=${m.awayTeamId}&fixtureId=${m.id}`}
                      className="mt-2 inline-flex items-center text-xs font-bold text-emerald-700 hover:underline"
                    >
                      Open match center →
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
              <Newspaper className="h-4 w-4 text-indigo-600" />
              League coverage
            </h2>
            <p className="mb-3 text-sm text-slate-600">
              Domestic leagues by country. Use{" "}
              <strong>International</strong> in the bar above for Nations League, Gold Cup, and World Cup.
            </p>
            <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {countries.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
              <Newspaper className="h-4 w-4 text-sky-600" />
              News wire
            </h2>
            <ul className="space-y-3 text-sm">
              {(data?.news ?? []).length === 0 && (
                <li className="text-slate-500">No club transactions yet.</li>
              )}
              {(data?.news ?? []).map((n) => (
                <li
                  key={n.id}
                  className="border-l-2 border-slate-200 pl-3 text-slate-700"
                >
                  <span
                    className={
                      n.amount >= 0 ?
                        "font-mono font-bold text-emerald-700"
                      : "font-mono font-bold text-red-600"
                    }
                  >
                    {formatMoneyPounds(Number(n.amount))}
                  </span>
                  <span className="text-slate-500"> · </span>
                  {n.headline}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function tabClass(active: boolean): string {
  return active
    ? "rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
    : "rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-emerald-500";
}

function capitalize(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

