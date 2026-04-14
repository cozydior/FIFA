import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { countryCodeToFlagEmoji } from "@/lib/flags";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { RankNumberBubble, RankTbdBubble, RANK_ROW_LABEL_CLASS } from "@/components/RankNumberBubble";
import {
  Check,
  ChevronDown,
  Minus,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import { CompetitionBrandLogo } from "@/components/CompetitionBrandLogo";
import { AetScoreLine } from "@/components/AetScoreLine";
import { fetchNationalTournamentHistory } from "@/lib/nationalTournamentHistory";
import { formatMoneyPounds } from "@/lib/formatMoney";
import { marketTrendLabel } from "@/lib/fotMobBadge";
import { priorSeasonMvByPlayer } from "@/lib/mvSeasonTrend";
import {
  countSeasonsWithTrophySlug,
  definitionsBySlug,
  groupTrophyCabinetEntries,
  parseTrophyList,
  type TrophyDefinitionRow,
} from "@/lib/trophyCabinet";
import { TrophyTitleStars } from "@/components/TrophyTitleStars";
import { HonourCabinetChips } from "@/components/HonourCabinetCompact";
import { NationalTournamentHistoryPager } from "@/components/NationalTournamentHistoryPager";
import { sortCabinetGroups } from "@/lib/honourDisplayOrder";
import { computeNationalTeamPointsFromFixtures } from "@/lib/nationalTeamRanking";
import { parseSeasonIndexFromLabel } from "@/lib/nextSeason";
import { formatFixtureCalendarLabel } from "@/lib/calendarPhases";

/** Always resolve national team from DB on each request (avoids stale cached pages showing no NT). */
export const dynamic = "force-dynamic";

const CALLOUP_ORDER = ["ST1", "ST2", "GK1"] as const;

const MAX_INTL_SIM_ROWS = 100;

type EligiblePoolPlayer = {
  id: string;
  name: string;
  role: string;
  profile_pic_url: string | null;
  market_value?: number | null;
  team_id?: string | null;
  teams?: { id: string; name: string; logo_url: string | null } | { id: string; name: string; logo_url: string | null }[] | null;
};

function NtPlayerMvWithTrend({
  playerId,
  marketValue,
  mvPriorByPlayer,
}: {
  playerId: string;
  marketValue: number;
  mvPriorByPlayer: Map<string, number | null>;
}) {
  const prior = mvPriorByPlayer.get(playerId) ?? null;
  const mvTrend = marketTrendLabel(prior, marketValue);
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="font-mono text-slate-800">{formatMoneyPounds(marketValue)}</span>
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
  );
}

function EligiblePlayerRow({
  pl,
  careerCallups,
  mvPriorByPlayer,
}: {
  pl: EligiblePoolPlayer;
  careerCallups: number;
  mvPriorByPlayer: Map<string, number | null>;
}) {
  const club = Array.isArray(pl.teams) ? pl.teams[0] : pl.teams;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <Link
        href={`/player/${pl.id}`}
        className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-slate-900 hover:text-emerald-800 hover:underline"
      >
        <PlayerAvatar name={pl.name} profilePicUrl={pl.profile_pic_url} />
        <span className="min-w-0 truncate">{pl.name}</span>
        {careerCallups > 0 ?
          <span
            className="inline-flex min-w-[1.2rem] shrink-0 items-center justify-center rounded-md bg-slate-200/90 px-1.5 py-0.5 text-[0.68rem] font-bold tabular-nums leading-none text-slate-700 ring-1 ring-slate-300/80"
            title="National team call-ups (all seasons)"
          >
            {careerCallups}
          </span>
        : null}
      </Link>
      <span className="shrink-0 text-xs text-slate-500">{pl.role}</span>
      <div className="flex w-full basis-full items-center justify-end gap-3 text-xs sm:w-auto sm:basis-auto">
        {club ?
          <Link
            href={`/team/${club.id}`}
            className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-emerald-800 hover:underline"
          >
            {club.logo_url ?
              // eslint-disable-next-line @next/next/no-img-element
              <img src={club.logo_url} alt="" className="h-5 w-5 rounded object-contain" />
            : null}
            {club.name}
          </Link>
        : <span className="text-slate-400">No club</span>}
        <NtPlayerMvWithTrend
          playerId={pl.id}
          marketValue={Number(pl.market_value ?? 0)}
          mvPriorByPlayer={mvPriorByPlayer}
        />
      </div>
    </li>
  );
}

function EligibleRoleDivider({ label }: { label: string }) {
  return (
    <li className="list-none border-y border-slate-200/90 bg-gradient-to-r from-slate-50 to-slate-100/80 px-4 py-2.5">
      <span className="block text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </span>
    </li>
  );
}

function intlSlugToWeekKind(slug: string): "world_cup" | "international" | "friendlies" {
  if (slug === "world_cup") return "world_cup";
  if (slug === "friendlies") return "friendlies";
  return "international";
}

function compareIntlScheduleChron(
  a: { season_label: string; week: number },
  b: { season_label: string; week: number },
): number {
  const na = parseSeasonIndexFromLabel(a.season_label);
  const nb = parseSeasonIndexFromLabel(b.season_label);
  if (na != null && nb != null && na !== nb) return na - nb;
  if (na != null && nb == null) return -1;
  if (na == null && nb != null) return 1;
  const sd = a.season_label.localeCompare(b.season_label);
  if (sd !== 0) return sd;
  return a.week - b.week;
}

function intlStageDetail(stage: string, groupName: string | null, week: number): string {
  const bits: string[] = [];
  if (stage === "group" && groupName) bits.push(`Group ${groupName}`);
  else if (stage === "SF") bits.push("Semi-final");
  else if (stage === "F") bits.push("Final");
  else if (stage && stage !== "group") bits.push(stage);
  bits.push(`Week ${week}`);
  return bits.join(" · ");
}

function intlFormResult(
  ntId: string,
  homeId: string,
  awayId: string,
  hs: number,
  as: number,
): "W" | "D" | "L" {
  const isHome = homeId === ntId;
  const gf = isHome ? hs : as;
  const ga = isHome ? as : hs;
  if (gf > ga) return "W";
  if (gf < ga) return "L";
  return "D";
}

export default async function CountryPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const supabase = getSupabaseAdmin();
  const sp = (await searchParams) ?? {};
  const seasonFromUrl = typeof sp.season === "string" ? sp.season : "";
  const currentSeason = await getCurrentSeasonLabel();
  const season = seasonFromUrl.trim() || currentSeason || "";

  const { data: country, error: countryError } = await supabase
    .from("countries")
    .select("id, code, name, flag_emoji")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (countryError) {
    console.error("[countries/[code]] countries", countryError.message);
  }
  if (!country) notFound();

  // Do not use .maybeSingle() here: duplicate rows for one country_id → PGRST116 and data=null.
  // Some DBs have not applied the migration that adds national_teams.trophies — retry without it.
  const ntFull = await supabase
    .from("national_teams")
    .select("id, name, confederation, flag_emoji, trophies")
    .eq("country_id", country.id)
    .limit(1);
  const ntErrMsg = ntFull.error?.message ?? "";
  const ntSlim =
    ntFull.error && (ntErrMsg.includes("trophies") || ntErrMsg.includes("does not exist")) ?
      await supabase
        .from("national_teams")
        .select("id, name, confederation, flag_emoji")
        .eq("country_id", country.id)
        .limit(1)
    : null;
  const ntResolved = ntSlim ?? ntFull;
  if (ntResolved.error) {
    console.error("[countries/[code]] national_teams", ntResolved.error.message);
  }
  const rawNt = ntResolved.data?.[0];
  const nt = rawNt
    ? {
        id: rawNt.id as string,
        name: rawNt.name as string,
        confederation: rawNt.confederation as string,
        flag_emoji: rawNt.flag_emoji as string | null,
        trophies: (rawNt as { trophies?: unknown }).trophies ?? [],
      }
    : null;

  const { data: callupRows } =
    nt && season.trim() ?
      await supabase
        .from("national_team_callups")
        .select(
          "slot, players(id, name, role, profile_pic_url, market_value, team_id, teams(id, name, logo_url))",
        )
        .eq("national_team_id", nt.id)
        .eq("season_label", season)
    : { data: [] as { slot: string; players: unknown }[] };

  const callupPlayerIds = new Set(
    (callupRows ?? [])
      .map((r) => {
        const pl = r.players as { id?: string } | null;
        return pl?.id;
      })
      .filter(Boolean) as string[],
  );

  const { data: ntCallupHistoryRows } = nt
    ? await supabase
        .from("national_team_callups")
        .select("player_id")
        .eq("national_team_id", nt.id)
    : { data: [] as { player_id: string }[] };

  const careerCallupCountByPlayer = new Map<string, number>();
  for (const r of ntCallupHistoryRows ?? []) {
    const pid = r.player_id as string;
    if (!pid) continue;
    careerCallupCountByPlayer.set(pid, (careerCallupCountByPlayer.get(pid) ?? 0) + 1);
  }

  const { data: nationalityPool } = nt
    ? await supabase
        .from("players")
        .select(
          "id, name, role, profile_pic_url, market_value, team_id, teams(id, name, logo_url)",
        )
        .eq("nationality", country.name)
        .order("name")
    : { data: [] as Record<string, unknown>[] };

  const availablePool = (nationalityPool ?? []).filter(
    (p) => !callupPlayerIds.has(p.id as string),
  );
  const poolRoleRank = (r: string) => (r === "ST" ? 0 : r === "GK" ? 1 : 2);
  const sortedAvailablePool = [...availablePool].sort((a, b) => {
    const pa = a as { name?: string; role?: string; market_value?: unknown };
    const pb = b as { name?: string; role?: string; market_value?: unknown };
    const rd = poolRoleRank(pa.role ?? "") - poolRoleRank(pb.role ?? "");
    if (rd !== 0) return rd;
    const mv =
      Number(pb.market_value ?? 0) - Number(pa.market_value ?? 0);
    if (mv !== 0) return mv;
    return String(pa.name ?? "").localeCompare(String(pb.name ?? ""));
  });

  const eligibleStrikers = sortedAvailablePool.filter(
    (p) => (p as { role?: string }).role === "ST",
  );
  const eligibleGks = sortedAvailablePool.filter(
    (p) => (p as { role?: string }).role === "GK",
  );
  const eligibleOther = sortedAvailablePool.filter((p) => {
    const r = (p as { role?: string }).role ?? "";
    return r !== "ST" && r !== "GK";
  });

  const ntMvPlayerIds = [
    ...new Set([
      ...(nationalityPool ?? []).map((p) => String((p as { id: unknown }).id)),
      ...(callupRows ?? []).map((r) => {
        const pl = r.players as { id?: string } | null;
        return pl?.id ?? "";
      }),
    ]),
  ].filter(Boolean);

  const { data: ntMvHistRows } =
    nt && ntMvPlayerIds.length > 0 && currentSeason ?
      await supabase
        .from("player_market_value_history")
        .select("player_id, season_label, market_value")
        .in("player_id", ntMvPlayerIds)
    : { data: [] as { player_id: string; season_label: string; market_value: number }[] };

  const mvPriorByPlayer = priorSeasonMvByPlayer(
    (ntMvHistRows ?? []).map((r) => ({
      player_id: r.player_id as string,
      season_label: r.season_label as string,
      market_value: Number(r.market_value),
    })),
    currentSeason,
  );

  const tournamentHistory = nt ? await fetchNationalTournamentHistory(supabase, nt.id) : [];

  const { data: trophyDefs } = await supabase
    .from("trophy_definitions")
    .select("id, slug, name, icon_url, sort_order");
  const defMap = definitionsBySlug((trophyDefs ?? []) as TrophyDefinitionRow[]);
  const ntCabinet = nt
    ? sortCabinetGroups(
        groupTrophyCabinetEntries(parseTrophyList(nt.trophies), defMap),
        "country",
        defMap,
      )
    : [];
  const worldCupStars = nt
    ? countSeasonsWithTrophySlug(nt.trophies, "world_cup", defMap)
    : 0;

  type IntlFormRow = {
    id: string;
    home_national_team_id: string;
    away_national_team_id: string;
    home_score: number;
    away_score: number;
  };
  type IntlSimRow = {
    id: string;
    week: number;
    stage: string;
    group_name: string | null;
    home_national_team_id: string;
    away_national_team_id: string;
    home_score: number;
    away_score: number;
    season_label: string;
    competitionSlug: string;
    competitionName: string;
    aetDisplayLine: string | null;
  };
  type IntlScheduleRow = {
    id: string;
    week: number;
    season_label: string;
    competitionSlug: string;
    competitionName: string;
    home_national_team_id: string;
    away_national_team_id: string;
  };
  let intlFormLast: IntlFormRow[] = [];
  let intlSimMatchHistory: IntlSimRow[] = [];
  let intlUpcomingSchedule: IntlScheduleRow[] = [];
  const intlFormOpp = new Map<
    string,
    { name: string; flag_emoji: string | null; countryCode: string | null }
  >();

  if (nt) {
    const { data: ifx } = await supabase
      .from("international_fixtures")
      .select(
        "id, week, stage, group_name, home_score, away_score, home_national_team_id, away_national_team_id, competition_id, score_detail",
      )
      .or(`home_national_team_id.eq.${nt.id},away_national_team_id.eq.${nt.id}`)
      .eq("status", "completed");

    const compIds = [...new Set((ifx ?? []).map((x) => x.competition_id).filter(Boolean))] as string[];
    const { data: compsMeta } =
      compIds.length > 0 ?
        await supabase
          .from("international_competitions")
          .select("id, season_label, slug, name")
          .in("id", compIds)
      : { data: [] as { id: string; season_label: string; slug: string; name: string }[] };
    const compById = new Map(
      (compsMeta ?? []).map((c) => [
        c.id,
        { season_label: c.season_label, slug: c.slug, name: c.name },
      ]),
    );

    const enriched = (ifx ?? [])
      .filter((f) => f.home_score != null && f.away_score != null)
      .map((f) => {
        const meta = compById.get(f.competition_id);
        const detail = f.score_detail as { displayLine?: string } | null | undefined;
        const aetDisplayLine =
          typeof detail?.displayLine === "string" ? detail.displayLine : null;
        return {
          id: f.id as string,
          week: Number(f.week),
          stage: String(f.stage ?? ""),
          group_name: (f.group_name as string | null) ?? null,
          home_national_team_id: f.home_national_team_id as string,
          away_national_team_id: f.away_national_team_id as string,
          home_score: Number(f.home_score),
          away_score: Number(f.away_score),
          season_label: meta?.season_label ?? "",
          competitionSlug: meta?.slug ?? "",
          competitionName: meta?.name ?? "International",
          aetDisplayLine,
        };
      })
      .sort((a, b) => {
        if (a.season_label !== b.season_label) return b.season_label.localeCompare(a.season_label);
        return b.week - a.week;
      });

    intlSimMatchHistory = enriched.slice(0, MAX_INTL_SIM_ROWS);

    const forForm = enriched.slice(0, 5).reverse();
    intlFormLast = forForm.map((f) => ({
      id: f.id,
      home_national_team_id: f.home_national_team_id,
      away_national_team_id: f.away_national_team_id,
      home_score: f.home_score,
      away_score: f.away_score,
    }));

    const oppIds = [
      ...new Set(
        intlSimMatchHistory.map((f) =>
          f.home_national_team_id === nt.id ? f.away_national_team_id : f.home_national_team_id,
        ),
      ),
    ];
    if (oppIds.length > 0) {
      const { data: opps } = await supabase
        .from("national_teams")
        .select("id, name, flag_emoji, countries(code, flag_emoji)")
        .in("id", oppIds);
      for (const o of opps ?? []) {
        const c = o.countries as
          | { code?: string; flag_emoji?: string | null }
          | { code?: string; flag_emoji?: string | null }[]
          | null;
        const country = Array.isArray(c) ? c[0] ?? null : c;
        const code = typeof country?.code === "string" ? country.code : "";
        const displayFlag =
          (country?.flag_emoji as string | null) ??
          (o.flag_emoji as string | null) ??
          (code ? countryCodeToFlagEmoji(code) : null);
        intlFormOpp.set(o.id, {
          name: o.name,
          flag_emoji: displayFlag,
          countryCode: code ? code.toLowerCase() : null,
        });
      }
    }

    const { data: schedRaw } = await supabase
      .from("international_fixtures")
      .select("id, week, home_national_team_id, away_national_team_id, competition_id")
      .or(`home_national_team_id.eq.${nt.id},away_national_team_id.eq.${nt.id}`)
      .eq("status", "scheduled");

    const schedCompIds = [...new Set((schedRaw ?? []).map((x) => x.competition_id).filter(Boolean))] as string[];
    const { data: schedCompsMeta } =
      schedCompIds.length > 0 ?
        await supabase
          .from("international_competitions")
          .select("id, season_label, slug, name")
          .in("id", schedCompIds)
      : { data: [] as { id: string; season_label: string; slug: string; name: string }[] };
    const schedCompById = new Map(
      (schedCompsMeta ?? []).map((c) => [
        c.id,
        { season_label: c.season_label, slug: c.slug, name: c.name },
      ]),
    );

    const enrichedSched: IntlScheduleRow[] = (schedRaw ?? []).map((f) => {
      const meta = schedCompById.get(f.competition_id);
      return {
        id: f.id as string,
        week: Number(f.week),
        season_label: meta?.season_label ?? "",
        competitionSlug: meta?.slug ?? "",
        competitionName: meta?.name ?? "International",
        home_national_team_id: f.home_national_team_id as string,
        away_national_team_id: f.away_national_team_id as string,
      };
    });
    enrichedSched.sort(compareIntlScheduleChron);
    intlUpcomingSchedule = enrichedSched.slice(0, 20);

    const schedOppIds = [
      ...new Set(
        intlUpcomingSchedule.map((f) =>
          f.home_national_team_id === nt.id ? f.away_national_team_id : f.home_national_team_id,
        ),
      ),
    ];
    const missingSchedOpp = schedOppIds.filter((oid) => !intlFormOpp.has(oid));
    if (missingSchedOpp.length > 0) {
      const { data: sopps } = await supabase
        .from("national_teams")
        .select("id, name, flag_emoji, countries(code, flag_emoji)")
        .in("id", missingSchedOpp);
      for (const o of sopps ?? []) {
        const c = o.countries as
          | { code?: string; flag_emoji?: string | null }
          | { code?: string; flag_emoji?: string | null }[]
          | null;
        const countryRow = Array.isArray(c) ? c[0] ?? null : c;
        const oppCode = typeof countryRow?.code === "string" ? countryRow.code : "";
        const displayFlag =
          (countryRow?.flag_emoji as string | null) ??
          (o.flag_emoji as string | null) ??
          (oppCode ? countryCodeToFlagEmoji(oppCode) : null);
        intlFormOpp.set(o.id, {
          name: o.name,
          flag_emoji: displayFlag,
          countryCode: oppCode ? oppCode.toLowerCase() : null,
        });
      }
    }
  }

  const slotOrder = (s: string) => {
    const i = (CALLOUP_ORDER as readonly string[]).indexOf(s);
    return i === -1 ? 99 : i;
  };
  const callupsList = [...(callupRows ?? [])].sort(
    (a, b) => slotOrder(a.slot) - slotOrder(b.slot),
  );

  // Squad value: total nationality pool MV + called-up squad MV
  const totalPoolValue = (nationalityPool ?? []).reduce(
    (s, p) => s + Number((p as { market_value?: unknown }).market_value ?? 0),
    0,
  );
  const calledUpValue = callupsList.reduce((s, r) => {
    const pl = r.players as { market_value?: unknown } | null;
    return s + Number(pl?.market_value ?? 0);
  }, 0);

  /** Confederation (e.g. UEFA / FIFA) + global ranks for pool MV and call-up MV. */
  let poolRankConf: number | null = null;
  let poolRankGlobal: number | null = null;
  let callupRankConf: number | null = null;
  let callupRankGlobal: number | null = null;
  let poolRankConfTotal = 0;
  let poolRankGlobalTotal = 0;
  let callupRankConfTotal = 0;
  let callupRankGlobalTotal = 0;
  let ratingRankGlobal: number | null = null;
  let ratingRankGlobalTotal = 0;

  if (nt) {
    const [{ data: ntAll }, { data: intlFxAll }] = await Promise.all([
      supabase
        .from("national_teams")
        .select("id, name, confederation, countries(name)")
        .order("name"),
      supabase
        .from("international_fixtures")
        .select(
          "home_national_team_id, away_national_team_id, home_score, away_score, stage, status",
        )
        .eq("status", "completed"),
    ]);
    const rows = ntAll ?? [];
    const countryNames = [
      ...new Set(
        rows
          .map((r) => {
            const c = r.countries as { name?: string } | { name?: string }[] | null | undefined;
            const one = Array.isArray(c) ? c[0] : c;
            return typeof one?.name === "string" ? one.name : null;
          })
          .filter((n): n is string => Boolean(n)),
      ),
    ];
    const ntIds = rows.map((r) => r.id as string);
    const confByNtId = new Map(rows.map((r) => [r.id as string, String(r.confederation ?? "").trim()]));
    const confByCountryName = new Map<string, string>();
    for (const r of rows) {
      const c = r.countries as { name?: string } | { name?: string }[] | null | undefined;
      const one = Array.isArray(c) ? c[0] : c;
      const nm = typeof one?.name === "string" ? one.name : null;
      if (nm) confByCountryName.set(nm, String(r.confederation ?? "").trim());
    }
    const myConf = String(nt.confederation ?? "").trim();

    const pointsByNtRating = new Map(
      computeNationalTeamPointsFromFixtures(intlFxAll ?? []).map((r) => [r.nationalTeamId, r]),
    );
    const sortRating = (a: (typeof rows)[number], b: (typeof rows)[number]) => {
      const ida = a.id as string;
      const idb = b.id as string;
      const pa = pointsByNtRating.get(ida)?.rating ?? 0;
      const pb = pointsByNtRating.get(idb)?.rating ?? 0;
      if (pb !== pa) return pb - pa;
      const recA = pointsByNtRating.get(ida);
      const recB = pointsByNtRating.get(idb);
      const gdA = (recA?.won ?? 0) - (recA?.lost ?? 0);
      const gdB = (recB?.won ?? 0) - (recB?.lost ?? 0);
      if (gdB !== gdA) return gdB - gdA;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    };
    const ratingGlobalOrder = [...rows].sort(sortRating);
    ratingRankGlobalTotal = ratingGlobalOrder.length;
    const gIdx = ratingGlobalOrder.findIndex((r) => r.id === nt.id);
    ratingRankGlobal = gIdx >= 0 ? gIdx + 1 : null;

    if (countryNames.length > 0) {
      const { data: poolPlayers } = await supabase
        .from("players")
        .select("nationality, market_value")
        .in("nationality", countryNames);
      const poolByName = new Map<string, number>();
      for (const n of countryNames) poolByName.set(n, 0);
      for (const p of poolPlayers ?? []) {
        const nat = String(p.nationality ?? "");
        if (!poolByName.has(nat)) continue;
        poolByName.set(nat, (poolByName.get(nat) ?? 0) + Number(p.market_value ?? 0));
      }
      const poolPeerNames =
        myConf ?
          countryNames.filter((n) => confByCountryName.get(n) === myConf)
        : [];
      if (myConf && poolPeerNames.length > 0) {
        const strictlyGreaterConf = poolPeerNames.filter(
          (n) => (poolByName.get(n) ?? 0) > totalPoolValue,
        ).length;
        poolRankConf = strictlyGreaterConf + 1;
        poolRankConfTotal = poolPeerNames.length;
      }
      const strictlyGreaterGlobal = countryNames.filter(
        (n) => (poolByName.get(n) ?? 0) > totalPoolValue,
      ).length;
      poolRankGlobal = strictlyGreaterGlobal + 1;
      poolRankGlobalTotal = countryNames.length;
    }

    if (season.trim() && ntIds.length > 0 && callupsList.length > 0) {
      const { data: allSeasonCallups } = await supabase
        .from("national_team_callups")
        .select("national_team_id, players(market_value)")
        .eq("season_label", season);
      const callupMvByNt = new Map<string, number>();
      for (const id of ntIds) callupMvByNt.set(id, 0);
      for (const row of allSeasonCallups ?? []) {
        const tid = row.national_team_id as string;
        if (!callupMvByNt.has(tid)) continue;
        const pl = row.players as { market_value?: unknown } | null;
        callupMvByNt.set(tid, (callupMvByNt.get(tid) ?? 0) + Number(pl?.market_value ?? 0));
      }
      const confPeerNtIds =
        myConf ? ntIds.filter((tid) => confByNtId.get(tid) === myConf) : [];
      if (myConf && confPeerNtIds.length > 0) {
        const strictlyGreaterConfCu = confPeerNtIds.filter(
          (tid) => (callupMvByNt.get(tid) ?? 0) > calledUpValue,
        ).length;
        callupRankConf = strictlyGreaterConfCu + 1;
        callupRankConfTotal = confPeerNtIds.length;
      }
      const strictlyGreaterCu = ntIds.filter(
        (tid) => (callupMvByNt.get(tid) ?? 0) > calledUpValue,
      ).length;
      callupRankGlobal = strictlyGreaterCu + 1;
      callupRankGlobalTotal = ntIds.length;
    }
  }

  const displayFlag =
    (country.flag_emoji as string | null) ??
    (nt?.flag_emoji as string | null) ??
    countryCodeToFlagEmoji(country.code);

  const callupMvCardTbd = !season.trim() || callupsList.length === 0;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f1f5f9_0%,#f8fafc_12rem,#f1f5f9_100%)]">
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <header className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
            <div className="mx-auto flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-5xl leading-none shadow-md ring-1 ring-slate-200/60 sm:mx-0 sm:h-32 sm:w-32 sm:text-6xl">
              {displayFlag ?
                <span aria-hidden>{displayFlag}</span>
              : <span className="text-3xl font-black text-slate-600">{country.name.slice(0, 1)}</span>}
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-emerald-700/90">
                National team
              </p>
              <h1 className="mt-1 flex flex-wrap items-center justify-center gap-x-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:justify-start sm:text-4xl">
                <span>{country.name}</span>
                <TrophyTitleStars count={worldCupStars} label="FIFA World Cup titles" />
              </h1>
              {nt && (
                <p className="mt-2 text-sm font-medium text-slate-600">
                  <span className="font-semibold text-slate-800">{nt.name}</span>
                  {" · "}
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {nt.confederation}
                  </span>
                </p>
              )}
              {!nt && (
                <p className="mt-2 text-sm text-amber-800">
                  No national team is linked to this country in <strong>this database</strong> yet — run{" "}
                  <strong>Seed national teams</strong> in Admin (or sync data with your deployed environment).
                </p>
              )}
              {nt && ratingRankGlobal != null ?
                <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <li className="flex flex-wrap items-center gap-2">
                    <span className={RANK_ROW_LABEL_CLASS}>Rating</span>
                    <RankNumberBubble rank={ratingRankGlobal} total={ratingRankGlobalTotal} />
                  </li>
                </ul>
              : null}
            </div>
          </div>
        </header>

        {nt && (
          <>
            <div className="mb-6 mt-8 grid gap-3 xl:grid-cols-2 xl:items-stretch">
              <div className="rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-sm xl:col-start-1 xl:row-start-1">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-0">
                  <div className="min-w-0 sm:pr-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">All nationals MV</p>
                    <p className="mt-1 text-xl font-black text-slate-900">
                      {formatMoneyPounds(totalPoolValue)}
                    </p>
                    {(poolRankConf != null || poolRankGlobal != null) && (
                      <ul className="mt-2.5 space-y-1.5">
                        {poolRankConf != null ?
                          <li className="flex flex-wrap items-center gap-2">
                            <span className={RANK_ROW_LABEL_CLASS}>{nt.confederation}</span>
                            <RankNumberBubble rank={poolRankConf} total={poolRankConfTotal} />
                          </li>
                        : null}
                        {poolRankGlobal != null ?
                          <li className="flex flex-wrap items-center gap-2">
                            <span className={RANK_ROW_LABEL_CLASS}>Global</span>
                            <RankNumberBubble rank={poolRankGlobal} total={poolRankGlobalTotal} />
                          </li>
                        : null}
                      </ul>
                    )}
                  </div>
                  <div className="min-w-0 border-t border-slate-200 pt-4 max-sm:rounded-xl max-sm:bg-slate-50/90 max-sm:p-3 sm:border-t-0 sm:rounded-xl sm:bg-slate-50/90 sm:pt-0 sm:pl-4 sm:pr-3 sm:ring-1 sm:ring-slate-200/70">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Called-up squad MV
                    </p>
                    <p className="mt-1 text-xl font-black text-slate-900">
                      {callupMvCardTbd ?
                        <span className="text-slate-400">TBD</span>
                      : formatMoneyPounds(calledUpValue)}
                    </p>
                    {callupMvCardTbd ?
                      <ul className="mt-2.5 space-y-1.5">
                        <li className="flex flex-wrap items-center gap-2">
                          <span className={RANK_ROW_LABEL_CLASS}>{nt.confederation}</span>
                          <RankTbdBubble />
                        </li>
                        <li className="flex flex-wrap items-center gap-2">
                          <span className={RANK_ROW_LABEL_CLASS}>Global</span>
                          <RankTbdBubble />
                        </li>
                      </ul>
                    : (callupRankConf != null || callupRankGlobal != null) ?
                      <ul className="mt-2.5 space-y-1.5">
                        {callupRankConf != null ?
                          <li className="flex flex-wrap items-center gap-2">
                            <span className={RANK_ROW_LABEL_CLASS}>{nt.confederation}</span>
                            <RankNumberBubble rank={callupRankConf} total={callupRankConfTotal} />
                          </li>
                        : null}
                        {callupRankGlobal != null ?
                          <li className="flex flex-wrap items-center gap-2">
                            <span className={RANK_ROW_LABEL_CLASS}>Global</span>
                            <RankNumberBubble rank={callupRankGlobal} total={callupRankGlobalTotal} />
                          </li>
                        : null}
                      </ul>
                    : null}
                  </div>
                </div>
              </div>

              <section className="rounded-2xl border border-slate-200/90 bg-white px-3 py-2 shadow-sm xl:col-start-1 xl:row-start-2">
                <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-slate-600">
                  <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  Current form (last 5 international)
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {intlFormLast.length > 0 ?
                    intlFormLast.map((f) => {
                      const letter = intlFormResult(
                        nt.id,
                        f.home_national_team_id,
                        f.away_national_team_id,
                        f.home_score,
                        f.away_score,
                      );
                      const ring =
                        letter === "W" ? "border-emerald-600 bg-emerald-500 text-white"
                        : letter === "L" ? "border-red-600 bg-red-500 text-white"
                        : "border-slate-400 bg-slate-400 text-white";
                      const oppId =
                        f.home_national_team_id === nt.id ?
                          f.away_national_team_id
                        : f.home_national_team_id;
                      const opp = intlFormOpp.get(oppId);
                      return (
                        <span
                          key={f.id}
                          className="inline-flex items-center"
                          title={
                            opp ?
                              `${letter === "W" ? "Win" : letter === "L" ? "Loss" : "Draw"} vs ${opp.name}`
                            : undefined
                          }
                        >
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-sm ${ring}`}
                          >
                            {letter === "W" ?
                              <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            : letter === "L" ?
                              <X className="h-3.5 w-3.5" strokeWidth={3} />
                            : <Minus className="h-3.5 w-3.5" strokeWidth={3} />}
                          </span>
                        </span>
                      );
                    })
                  : <span className="text-sm text-slate-500">—</span>}
                </div>
              </section>

              <div className="flex min-h-0 flex-col xl:col-start-2 xl:row-span-2 xl:row-start-1">
                <NationalTournamentHistoryPager
                  rows={tournamentHistory}
                  emptyMessage="No tournament history yet — play or simulate international competitions to populate this."
                />
              </div>
            </div>

            <section className="mb-8">
              <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                <Trophy className="h-4 w-4 text-amber-500" />
                International honours
              </h2>
              {ntCabinet.length === 0 ?
                <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  No silverware on file yet — use Admin to record honours.
                </p>
              : <HonourCabinetChips groups={ntCabinet} defMap={defMap} />}
            </section>
          </>
        )}

        {nt && (
          <section className="mb-8">
            <h2 className="mb-1 text-sm font-bold uppercase tracking-widest text-slate-500">
              Squad — call-ups
            </h2>
            <p className="mb-4 text-sm text-slate-600">
              Selected players for <span className="font-mono">{season || "—"}</span> (set in Admin →
              International call-ups).
            </p>
            {callupsList.length === 0 ?
              <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                No call-ups recorded for this season yet.
              </p>
            : <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
                {callupsList.map((row) => {
                  const pl = row.players as
                    | {
                        id: string;
                        name: string;
                        role: string;
                        profile_pic_url: string | null;
                        market_value?: number | null;
                        team_id?: string | null;
                        teams?: { id: string; name: string; logo_url: string | null } | { id: string; name: string; logo_url: string | null }[] | null;
                      }
                    | null;
                  if (!pl) return null;
                  const club = Array.isArray(pl.teams) ? pl.teams[0] : pl.teams;
                  return (
                    <li
                      key={row.slot}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <span className="w-12 shrink-0 font-mono text-xs font-bold text-slate-500">
                        {row.slot}
                      </span>
                      <Link
                        href={`/player/${pl.id}`}
                        className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-slate-900 hover:text-emerald-800 hover:underline"
                      >
                        <PlayerAvatar name={pl.name} profilePicUrl={pl.profile_pic_url} />
                        <span className="truncate">{pl.name}</span>
                      </Link>
                      <span className="shrink-0 text-xs text-slate-500">{pl.role}</span>
                      <div className="flex w-full basis-full flex-wrap items-center gap-2 pl-12 text-xs text-slate-600 sm:w-auto sm:basis-auto sm:pl-0">
                        {club ?
                          <Link
                            href={`/team/${club.id}`}
                            className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-emerald-800 hover:underline"
                          >
                            {club.logo_url ?
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={club.logo_url} alt="" className="h-5 w-5 rounded object-contain" />
                            : null}
                            {club.name}
                          </Link>
                        : <span className="text-slate-400">No club</span>}
                        <NtPlayerMvWithTrend
                          playerId={pl.id}
                          marketValue={Number(pl.market_value ?? 0)}
                          mvPriorByPlayer={mvPriorByPlayer}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            }
          </section>
        )}

        {nt && intlSimMatchHistory.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
              International sim results
            </h2>
            <p className="mb-3 text-sm text-slate-600">
              Completed fixtures from the sim (winner, score, competition). There is no saved match report — rows are
              read-only, like club saved sims without opening Match center.
            </p>
            <details className="group rounded-xl border border-slate-200 bg-white shadow-sm open:shadow-md">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                <span>
                  Browse {intlSimMatchHistory.length} international match
                  {intlSimMatchHistory.length === 1 ? "" : "es"}
                  {intlSimMatchHistory.length >= MAX_INTL_SIM_ROWS ?
                    ` (latest ${MAX_INTL_SIM_ROWS})`
                  : ""}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="border-t border-slate-100">
                {intlSimMatchHistory.map((m) => {
                  const isHome = m.home_national_team_id === nt.id;
                  const oppId = isHome ? m.away_national_team_id : m.home_national_team_id;
                  const opp = intlFormOpp.get(oppId);
                  const oppName = opp?.name ?? "Opponent";
                  const sFor = isHome ? m.home_score : m.away_score;
                  const sAgainst = isHome ? m.away_score : m.home_score;
                  const letter = intlFormResult(
                    nt.id,
                    m.home_national_team_id,
                    m.away_national_team_id,
                    m.home_score,
                    m.away_score,
                  );
                  const badge =
                    letter === "W" ? "bg-emerald-500 text-white"
                    : letter === "L" ? "bg-red-500 text-white"
                    : "bg-slate-400 text-white";
                  const tourHref =
                    m.competitionSlug ?
                      `/competitions/international/${m.competitionSlug}?season=${encodeURIComponent(m.season_label)}`
                    : null;
                  return (
                    <li key={m.id}>
                      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0">
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-black ${badge}`}
                        >
                          {letter}
                        </span>
                        <span className="inline-flex min-w-0 max-w-[11rem] shrink-0 flex-col gap-0.5 sm:max-w-[14rem]">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            {m.competitionSlug ?
                              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white p-0.5">
                                <CompetitionBrandLogo slug={m.competitionSlug} className="h-4 w-4" />
                              </span>
                            : null}
                            {tourHref ?
                              <Link href={tourHref} className="min-w-0 truncate hover:text-emerald-800 hover:underline">
                                {m.competitionName}
                              </Link>
                            : <span className="min-w-0 truncate">{m.competitionName}</span>}
                          </span>
                          <span className="text-[0.65rem] font-medium text-slate-500">
                            {intlStageDetail(m.stage, m.group_name, m.week)}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {displayFlag ?
                            <span className="flex h-9 w-9 items-center justify-center text-lg leading-none" aria-hidden>
                              {displayFlag}
                            </span>
                          : null}
                          <span className="text-xs font-bold text-slate-400">{isHome ? "v" : "@"}</span>
                          {opp?.flag_emoji ?
                            <span className="flex h-9 w-9 items-center justify-center text-lg leading-none" aria-hidden>
                              {opp.flag_emoji}
                            </span>
                          : null}
                        </span>
                        <span className="min-w-0 flex-1 font-semibold text-slate-900">
                          {isHome ? "vs" : "@"} {oppName}
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0">
                          <span className="font-mono font-bold tabular-nums text-slate-800">
                            {sFor}–{sAgainst}
                          </span>
                          <AetScoreLine line={m.aetDisplayLine} className="mt-0 justify-end" />
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">{m.season_label}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          </section>
        )}

        {nt && intlUpcomingSchedule.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">
              Schedule (next fixtures)
            </h2>
            <ul className="space-y-2">
              {intlUpcomingSchedule.map((f) => {
                const isHome = f.home_national_team_id === nt.id;
                const oppId = isHome ? f.away_national_team_id : f.home_national_team_id;
                const opp = intlFormOpp.get(oppId);
                const oppName = opp?.name ?? "Opponent";
                const weekLabel = formatFixtureCalendarLabel(f.week, intlSlugToWeekKind(f.competitionSlug));
                const tourHref =
                  f.competitionSlug ?
                    `/competitions/international/${f.competitionSlug}?season=${encodeURIComponent(f.season_label)}`
                  : null;
                return (
                  <li
                    key={f.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                  >
                    <p className="flex flex-wrap items-center gap-3">
                      {f.competitionSlug ?
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white p-0.5 shadow-sm">
                          <CompetitionBrandLogo slug={f.competitionSlug} className="h-6 w-6" />
                        </span>
                      : null}
                      <span className="text-lg font-semibold tracking-tight text-slate-900">{weekLabel}</span>
                      <span className="text-sm font-medium tabular-nums text-slate-500">{f.season_label}</span>
                      {tourHref ?
                        <Link
                          href={tourHref}
                          className="min-w-0 max-w-[10rem] truncate text-xs font-semibold text-slate-600 hover:text-emerald-800 hover:underline sm:max-w-[14rem]"
                        >
                          {f.competitionName}
                        </Link>
                      : <span className="min-w-0 max-w-[10rem] truncate text-xs font-semibold text-slate-600 sm:max-w-[14rem]">
                          {f.competitionName}
                        </span>}
                    </p>
                    <span className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-2 font-semibold text-slate-900 sm:justify-end">
                      <span className="inline-flex items-center gap-2">
                        {isHome ?
                          <>
                            {displayFlag ?
                              <span className="text-xl leading-none" aria-hidden>
                                {displayFlag}
                              </span>
                            : null}
                            <span>{nt.name}</span>
                            <span className="text-slate-400">v</span>
                            {opp?.countryCode ?
                              <Link
                                href={`/countries/${opp.countryCode}`}
                                className="inline-flex items-center gap-2 hover:text-emerald-800 hover:underline"
                              >
                                {opp.flag_emoji ?
                                  <span className="text-xl leading-none" aria-hidden>
                                    {opp.flag_emoji}
                                  </span>
                                : null}
                                {oppName}
                              </Link>
                            : <span className="inline-flex items-center gap-2">
                                {opp?.flag_emoji ?
                                  <span className="text-xl leading-none" aria-hidden>
                                    {opp.flag_emoji}
                                  </span>
                                : null}
                                {oppName}
                              </span>}
                          </>
                        : <>
                            {opp?.countryCode ?
                              <Link
                                href={`/countries/${opp.countryCode}`}
                                className="inline-flex items-center gap-2 hover:text-emerald-800 hover:underline"
                              >
                                {opp?.flag_emoji ?
                                  <span className="text-xl leading-none" aria-hidden>
                                    {opp.flag_emoji}
                                  </span>
                                : null}
                                {oppName}
                              </Link>
                            : <span className="inline-flex items-center gap-2">
                                {opp?.flag_emoji ?
                                  <span className="text-xl leading-none" aria-hidden>
                                    {opp.flag_emoji}
                                  </span>
                                : null}
                                {oppName}
                              </span>}
                            <span className="text-slate-400">@</span>
                            {displayFlag ?
                              <span className="text-xl leading-none" aria-hidden>
                                {displayFlag}
                              </span>
                            : null}
                            <span>{nt.name}</span>
                          </>
                        }
                      </span>
                    </span>
                    <Link
                      href={`/matchday?intlFixtureId=${encodeURIComponent(f.id)}`}
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

        {nt && season.trim() && (
          <section className="mb-8">
            <h2 className="mb-1 text-sm font-bold uppercase tracking-widest text-slate-500">
              Eligible players (not called up)
            </h2>
            <p className="mb-4 text-sm text-slate-600">
              Same nationality as <strong>{country.name}</strong> this season — available for selection in Admin call-ups.
            </p>
            {availablePool.length === 0 ?
              <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                {nationalityPool?.length ?
                  "Everyone in the pool is already in the squad above."
                : "No players found with this nationality."}
              </p>
            : <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
                {eligibleStrikers.map((raw) => {
                  const pl = raw as EligiblePoolPlayer;
                  return (
                    <EligiblePlayerRow
                      key={pl.id}
                      pl={pl}
                      careerCallups={careerCallupCountByPlayer.get(pl.id) ?? 0}
                      mvPriorByPlayer={mvPriorByPlayer}
                    />
                  );
                })}
                {eligibleStrikers.length > 0 && eligibleGks.length > 0 ?
                  <EligibleRoleDivider label="Goalkeepers" />
                : null}
                {eligibleGks.map((raw) => {
                  const pl = raw as EligiblePoolPlayer;
                  return (
                    <EligiblePlayerRow
                      key={pl.id}
                      pl={pl}
                      careerCallups={careerCallupCountByPlayer.get(pl.id) ?? 0}
                      mvPriorByPlayer={mvPriorByPlayer}
                    />
                  );
                })}
                {(eligibleStrikers.length > 0 || eligibleGks.length > 0) && eligibleOther.length > 0 ?
                  <EligibleRoleDivider label="Other positions" />
                : null}
                {eligibleOther.map((raw) => {
                  const pl = raw as EligiblePoolPlayer;
                  return (
                    <EligiblePlayerRow
                      key={pl.id}
                      pl={pl}
                      careerCallups={careerCallupCountByPlayer.get(pl.id) ?? 0}
                      mvPriorByPlayer={mvPriorByPlayer}
                    />
                  );
                })}
              </ul>
            }
          </section>
        )}
      </div>
    </div>
  );
}
