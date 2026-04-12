import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { countryCodeToFlagEmoji } from "@/lib/flags";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import {
  Check,
  ChevronDown,
  History,
  Minus,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import { CompetitionBrandLogo } from "@/components/CompetitionBrandLogo";
import { fetchNationalTournamentHistory } from "@/lib/nationalTournamentHistory";
import { formatMoneyPounds } from "@/lib/formatMoney";
import {
  countSeasonsWithTrophySlug,
  definitionsBySlug,
  groupTrophyCabinetEntries,
  parseTrophyList,
  type TrophyDefinitionRow,
} from "@/lib/trophyCabinet";
import { TrophyTitleStars } from "@/components/TrophyTitleStars";
import { HonourCabinetChips } from "@/components/HonourCabinetCompact";
import { sortCabinetGroups } from "@/lib/honourDisplayOrder";

/** Always resolve national team from DB on each request (avoids stale cached pages showing no NT). */
export const dynamic = "force-dynamic";

const CALLOUP_ORDER = ["ST1", "ST2", "GK1"] as const;

const MAX_INTL_SIM_ROWS = 100;

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

  const { data: nationalityPool } =
    nt && season.trim() ?
      await supabase
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
  };
  let intlFormLast: IntlFormRow[] = [];
  let intlSimMatchHistory: IntlSimRow[] = [];
  const intlFormOpp = new Map<string, { name: string; flag_emoji: string | null }>();

  if (nt) {
    const { data: ifx } = await supabase
      .from("international_fixtures")
      .select(
        "id, week, stage, group_name, home_score, away_score, home_national_team_id, away_national_team_id, competition_id",
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
        intlFormOpp.set(o.id, { name: o.name, flag_emoji: displayFlag });
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

  const displayFlag =
    (country.flag_emoji as string | null) ??
    (nt?.flag_emoji as string | null) ??
    countryCodeToFlagEmoji(country.code);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f1f5f9_0%,#f8fafc_12rem,#f1f5f9_100%)]">
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <header className="mb-8 overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:p-8">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-emerald-700/90">
            National team
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-x-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            <span className="mr-1">{displayFlag}</span>
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
          <div className="mt-3 flex flex-wrap gap-3">
            <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
                All nationals MV
              </p>
              <p className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                {formatMoneyPounds(totalPoolValue)}
              </p>
            </div>
            {callupsList.length > 0 && (
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-2">
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-emerald-700">
                  Called-up squad MV
                </p>
                <p className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                  {formatMoneyPounds(calledUpValue)}
                </p>
              </div>
            )}
          </div>
        </header>

        {nt && (
          <div className="mb-8 grid items-start gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 shadow-sm">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                <TrendingUp className="h-4 w-4 shrink-0 text-emerald-600" />
                Current form (last 5 international)
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
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
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 shadow-sm ${ring}`}
                        >
                          {letter === "W" ?
                            <Check className="h-4 w-4" strokeWidth={3} />
                          : letter === "L" ?
                            <X className="h-4 w-4" strokeWidth={3} />
                          : <Minus className="h-4 w-4" strokeWidth={3} />}
                        </span>
                      </span>
                    );
                  })
                : <span className="text-sm text-slate-500">—</span>}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                <History className="h-4 w-4 shrink-0 text-emerald-600" />
                Tournament history
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Finishes from international tournaments in the sim (fixtures &amp; group tables).
              </p>
              {tournamentHistory.length === 0 ?
                <p className="mt-4 text-sm text-slate-500">
                  No tournament history yet — play or simulate international competitions to populate
                  this.
                </p>
              : <ul className="mt-4 space-y-3">
                  {tournamentHistory.map((row) => {
                    const badge =
                      row.kind === "champion" ? "bg-amber-400 text-amber-950 ring-amber-300/80"
                      : row.kind === "runner_up" ? "bg-slate-200 text-slate-900 ring-slate-300/80"
                      : row.kind === "semis" || row.kind === "final_pending" ?
                        "bg-violet-200 text-violet-950 ring-violet-300/70"
                      : row.kind === "qualified" ? "bg-emerald-200 text-emerald-950 ring-emerald-300/70"
                      : row.kind === "group_out" ? "bg-rose-100 text-rose-900 ring-rose-200/80"
                      : row.kind === "group_live" ? "bg-sky-100 text-sky-900 ring-sky-200/80"
                      : "bg-slate-100 text-slate-700 ring-slate-200/80";
                    return (
                      <li
                        key={`${row.seasonLabel}-${row.slug}`}
                        className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">
                              {row.seasonLabel}
                            </p>
                            <p className="mt-0.5 font-semibold text-slate-900">{row.competitionName}</p>
                          </div>
                          <span
                            className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-black uppercase tracking-wide ring-1 ${badge}`}
                          >
                            {row.finish}
                          </span>
                        </div>
                        {row.detail ?
                          <p className="mt-2 text-xs leading-relaxed text-slate-600">{row.detail}</p>
                        : null}
                        <Link
                          href={`/competitions/international/${row.slug}?season=${encodeURIComponent(row.seasonLabel)}`}
                          className="mt-3 inline-block text-xs font-bold text-emerald-800 hover:underline"
                        >
                          Open tournament →
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              }
            </section>
          </div>
        )}

        {nt && (
          <section className="mb-8 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-500">
              <Trophy className="h-4 w-4 text-amber-500" />
              International honours
            </h2>
            {ntCabinet.length === 0 ?
              <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                No silverware on file yet — use Admin to record honours.
              </p>
            : <div className="mt-4">
                <HonourCabinetChips groups={ntCabinet} defMap={defMap} />
              </div>
            }
          </section>
        )}

        {nt && (
          <section className="mb-8 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
              Squad — call-ups
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Selected players for <span className="font-mono">{season || "—"}</span> (set in Admin →
              International call-ups).
            </p>
            {callupsList.length === 0 ?
              <p className="mt-4 text-sm text-slate-500">
                No call-ups recorded for this season yet.
              </p>
            : <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200/80">
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
                      className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl"
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
                        <span className="font-mono text-slate-500">
                          {formatMoneyPounds(Number(pl.market_value ?? 0))}
                        </span>
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
                        <span className="shrink-0 font-mono font-bold tabular-nums text-slate-800">
                          {sFor}–{sAgainst}
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

        {nt && season.trim() && (
          <section className="mb-8 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
              Eligible players (not called up)
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Same nationality as <strong>{country.name}</strong> this season — available for selection in Admin call-ups.
            </p>
            {availablePool.length === 0 ?
              <p className="mt-4 text-sm text-slate-500">
                {nationalityPool?.length ?
                  "Everyone in the pool is already in the squad above."
                : "No players found with this nationality."}
              </p>
            : <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200/80">
                {sortedAvailablePool.map((raw) => {
                  const pl = raw as {
                    id: string;
                    name: string;
                    role: string;
                    profile_pic_url: string | null;
                    market_value?: number | null;
                    team_id?: string | null;
                    teams?: { id: string; name: string; logo_url: string | null } | { id: string; name: string; logo_url: string | null }[] | null;
                  };
                  const club = Array.isArray(pl.teams) ? pl.teams[0] : pl.teams;
                  return (
                    <li
                      key={pl.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl"
                    >
                      <Link
                        href={`/player/${pl.id}`}
                        className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-slate-900 hover:text-emerald-800 hover:underline"
                      >
                        <PlayerAvatar name={pl.name} profilePicUrl={pl.profile_pic_url} />
                        <span className="truncate">{pl.name}</span>
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
                        <span className="font-mono text-slate-500">
                          {formatMoneyPounds(Number(pl.market_value ?? 0))}
                        </span>
                      </div>
                    </li>
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
