import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { countryCodeToFlagEmoji } from "@/lib/flags";
import { hasDomesticClubFootball } from "@/lib/dashboardLinks";
import { computeNationalTeamPointsFromFixtures } from "@/lib/nationalTeamRanking";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { formatMoneyPounds } from "@/lib/formatMoney";
import {
  parseSeasonNumberFromLabel,
  resolveWorldCupQualifierNationalTeamIds,
} from "@/lib/federationWorldCupQual";
import { countSeasonsWithTrophySlug, definitionsBySlug, type TrophyDefinitionRow } from "@/lib/trophyCabinet";
import { TrophyTitleStars } from "@/components/TrophyTitleStars";

export const revalidate = 60;

function countriesIndexQuery(parts: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(parts)) {
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default async function NationalTeamsIndexPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const rankBy =
    typeof sp.rank === "string" && sp.rank.toLowerCase() === "mv" ? "mv" : "rating";
  const squadBasis =
    typeof sp.squad === "string" && sp.squad.toLowerCase() === "callups" ? "callups" : "pool";
  const seasonFromUrl = typeof sp.season === "string" ? sp.season.trim() : "";
  const seasonLabel = seasonFromUrl || (await getCurrentSeasonLabel()) || "";

  const supabase = getSupabaseAdmin();
  const [{ data: ntsRaw }, { data: intlFx }, { data: seasonsRows }, { data: trophyDefs }] =
    await Promise.all([
      supabase
        .from("national_teams")
        .select("id, name, confederation, flag_emoji, trophies, countries(code, name, flag_emoji)"),
      supabase
        .from("international_fixtures")
        .select(
          "home_national_team_id, away_national_team_id, home_score, away_score, stage, status",
        )
        .eq("status", "completed"),
      supabase.from("seasons").select("label").order("created_at", { ascending: false }),
      supabase.from("trophy_definitions").select("id, slug, name, icon_url, sort_order"),
    ]);

  const trophyDefMap = definitionsBySlug((trophyDefs ?? []) as TrophyDefinitionRow[]);
  const seasonNum = seasonLabel ? parseSeasonNumberFromLabel(seasonLabel) : null;
  const wcQualIds =
    seasonLabel && seasonNum != null && seasonNum % 2 === 0 ?
      await resolveWorldCupQualifierNationalTeamIds(supabase, seasonLabel)
    : new Set<string>();

  const pointsRows = computeNationalTeamPointsFromFixtures(intlFx ?? []);
  const pointsByNt = new Map(pointsRows.map((r) => [r.nationalTeamId, r]));

  type NtRow = NonNullable<typeof ntsRaw>[number];
  const countryNameByNtId = new Map<string, string>();
  for (const t of ntsRaw ?? []) {
    const c = t.countries as { name?: string } | { name?: string }[] | null | undefined;
    const one = Array.isArray(c) ? c[0] : c;
    const nm = typeof one?.name === "string" ? one.name : null;
    if (nm) countryNameByNtId.set(t.id as string, nm);
  }
  const distinctCountryNames = [...new Set(countryNameByNtId.values())];
  const poolMvByNationality = new Map<string, number>();
  if (distinctCountryNames.length > 0) {
    const { data: poolPlayers } = await supabase
      .from("players")
      .select("nationality, market_value")
      .in("nationality", distinctCountryNames);
    for (const n of distinctCountryNames) poolMvByNationality.set(n, 0);
    for (const p of poolPlayers ?? []) {
      const nat = String(p.nationality ?? "");
      if (!poolMvByNationality.has(nat)) continue;
      poolMvByNationality.set(
        nat,
        (poolMvByNationality.get(nat) ?? 0) + Number(p.market_value ?? 0),
      );
    }
  }
  const poolMvByNtId = new Map<string, number>();
  for (const t of ntsRaw ?? []) {
    const nm = countryNameByNtId.get(t.id as string);
    poolMvByNtId.set(t.id as string, nm ? (poolMvByNationality.get(nm) ?? 0) : 0);
  }

  const callupMvByNtId = new Map<string, number>();
  if (seasonLabel) {
    for (const t of ntsRaw ?? []) callupMvByNtId.set(t.id as string, 0);
    const { data: cupRows } = await supabase
      .from("national_team_callups")
      .select("national_team_id, players(market_value)")
      .eq("season_label", seasonLabel);
    for (const row of cupRows ?? []) {
      const tid = row.national_team_id as string;
      if (!callupMvByNtId.has(tid)) continue;
      const pl = row.players as { market_value?: unknown } | null;
      callupMvByNtId.set(tid, (callupMvByNtId.get(tid) ?? 0) + Number(pl?.market_value ?? 0));
    }
  }

  function confRank(c: string | null | undefined) {
    const u = (c ?? "").toUpperCase();
    if (u === "UEFA") return 0;
    if (u === "FIFA") return 1;
    return 2;
  }

  const nts = [...(ntsRaw ?? [])].sort((a, b) => {
    const d = confRank(a.confederation) - confRank(b.confederation);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });

  const uefa = nts.filter((t) => (t.confederation ?? "").toUpperCase() === "UEFA");
  const fifa = nts.filter((t) => (t.confederation ?? "").toUpperCase() === "FIFA");
  const otherConf = nts.filter((t) => {
    const u = (t.confederation ?? "").toUpperCase();
    return u !== "UEFA" && u !== "FIFA";
  });

  const rankingSorted = [...nts].sort((a, b) => {
    if (rankBy === "mv") {
      const va =
        squadBasis === "callups" ? (callupMvByNtId.get(a.id) ?? 0) : (poolMvByNtId.get(a.id) ?? 0);
      const vb =
        squadBasis === "callups" ? (callupMvByNtId.get(b.id) ?? 0) : (poolMvByNtId.get(b.id) ?? 0);
      if (vb !== va) return vb - va;
      return a.name.localeCompare(b.name);
    }
    const pa = pointsByNt.get(a.id)?.rating ?? 0;
    const pb = pointsByNt.get(b.id)?.rating ?? 0;
    if (pb !== pa) return pb - pa;
    const recA = pointsByNt.get(a.id);
    const recB = pointsByNt.get(b.id);
    const gdA = (recA?.won ?? 0) - (recA?.lost ?? 0);
    const gdB = (recB?.won ?? 0) - (recB?.lost ?? 0);
    if (gdB !== gdA) return gdB - gdA;
    return a.name.localeCompare(b.name);
  });

  const hrefRating = `/countries${countriesIndexQuery({ season: seasonLabel || undefined })}`;
  const hrefMvPool = `/countries${countriesIndexQuery({ rank: "mv", squad: undefined, season: seasonLabel || undefined })}`;
  const hrefMvCallups = `/countries${countriesIndexQuery({ rank: "mv", squad: "callups", season: seasonLabel || undefined })}`;

  function FederationWcQualBadge({
    confederation,
    nationalTeamId,
  }: {
    confederation: string | null | undefined;
    nationalTeamId: string;
  }) {
    const u = (confederation ?? "").toUpperCase();
    if (u !== "UEFA" && u !== "FIFA") {
      return <span className="text-xs text-slate-300">—</span>;
    }
    if (seasonNum == null || !seasonLabel.trim()) {
      return <span className="text-xs text-slate-300">—</span>;
    }
    if (seasonNum % 2 === 1) {
      return (
        <span
          className="inline-flex h-7 min-w-[2.25rem] items-center justify-center rounded-full bg-slate-200 px-1.5 text-[0.6rem] font-black uppercase tracking-wide text-slate-600 ring-1 ring-slate-300/80"
          title="World Cup qualification is shown in even seasons (Season 2, 4, …)"
        >
          TBD
        </span>
      );
    }
    if (wcQualIds.size === 0) {
      return (
        <span
          className="inline-flex h-7 min-w-[2.25rem] items-center justify-center rounded-full bg-slate-200 px-1.5 text-[0.6rem] font-black uppercase tracking-wide text-slate-600 ring-1 ring-slate-300/80"
          title="Qualifiers not set yet — complete the prior season’s Nations League and Gold Cup groups"
        >
          TBD
        </span>
      );
    }
    const qualified = wcQualIds.has(nationalTeamId);
    return qualified ?
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-[0.7rem] font-black text-white shadow-sm ring-1 ring-emerald-600/50"
          title="Qualified for this season’s World Cup"
        >
          Q
        </span>
      : <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-[0.7rem] font-black text-white shadow-sm ring-1 ring-red-700/40"
          title="Eliminated — did not finish top two in the prior season’s regional group"
        >
          E
        </span>;
  }

  function NtCard({
    t,
    rankMode,
    squadMode,
  }: {
    t: NtRow;
    rankMode: "rating" | "mv";
    squadMode: "pool" | "callups";
  }) {
    const c = t.countries as
      | { code: string; name: string; flag_emoji: string | null }
      | { code: string; name: string; flag_emoji: string | null }[]
      | null;
    const country = Array.isArray(c) ? c[0] ?? null : c;
    const code = country?.code ?? "";
    const displayFlag =
      (country?.flag_emoji as string | null) ??
      (t.flag_emoji as string | null) ??
      countryCodeToFlagEmoji(code);
    const domestic = country?.name ? hasDomesticClubFootball(country.name) : false;
    const pts = pointsByNt.get(t.id);
    const poolV = poolMvByNtId.get(t.id) ?? 0;
    const cupV = callupMvByNtId.get(t.id) ?? 0;
    const mvLine =
      rankMode === "mv" ?
        squadMode === "callups" ?
          `Call-ups ${formatMoneyPounds(cupV)}`
        : `All nationals ${formatMoneyPounds(poolV)}`
      : null;
    return (
      <Link
        href={`/countries/${code.toLowerCase()}`}
        className="rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm transition hover:border-emerald-500/60"
      >
        <p className="text-2xl">{displayFlag}</p>
        <h2 className="mt-2 text-lg font-bold text-slate-900">{t.name}</h2>
        <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">
          {t.confederation}
        </p>
        {rankMode === "mv" ?
          <p className="mt-2 font-mono text-sm font-bold tabular-nums text-slate-800">{mvLine}</p>
        : <p className="mt-2 font-mono text-sm font-bold tabular-nums text-slate-800">
            {pts ? `${pts.rating} rating` : "0 rating"}
            {pts && pts.played > 0 ?
              <span className="ml-2 font-sans text-xs font-medium text-slate-500">
                ({pts.won}-{pts.drawn}-{pts.lost})
              </span>
            : null}
          </p>
        }
        {domestic ?
          <p className="mt-3 text-xs font-semibold text-emerald-800">Domestic clubs modeled</p>
        : <p className="mt-3 text-xs text-slate-500">International only (no club pyramid)</p>}
      </Link>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f1f5f9_0%,#f8fafc_12rem,#f1f5f9_100%)]">
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          National teams
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          International squads by confederation. Domestic club leagues exist only for{" "}
          <strong>England</strong>, <strong>France</strong>, and <strong>Spain</strong> in this
          simulation — other nations are international-only here.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Tournaments:{" "}
          <Link
            href="/competitions/international"
            className="font-semibold text-emerald-800 hover:underline"
          >
            International hub
          </Link>{" "}
          (Nations League, Gold Cup, World Cup).
        </p>

        {(nts ?? []).length === 0 ?
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white/80 px-5 py-8 text-center text-sm text-slate-600">
            No national teams yet. In <strong>Admin</strong>, run{" "}
            <strong>Seed national teams</strong> to create one team per country.
          </div>
        : <>
            <section className="mt-8 rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <h2 className="text-lg font-bold text-slate-900">
                  {rankBy === "mv" ? "Federation ranking (market value)" : "Federation ranking (rating)"}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">
                    Sort
                  </span>
                  <Link
                    href={hrefRating}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      rankBy === "rating" ?
                        "bg-emerald-700 text-white shadow-sm"
                      : "border border-slate-300 bg-white text-slate-700 hover:border-emerald-400"
                    }`}
                  >
                    Rating
                  </Link>
                  <Link
                    href={hrefMvPool}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      rankBy === "mv" && squadBasis === "pool" ?
                        "bg-emerald-700 text-white shadow-sm"
                      : "border border-slate-300 bg-white text-slate-700 hover:border-emerald-400"
                    }`}
                  >
                    Total MV
                  </Link>
                </div>
              </div>
              {rankBy === "mv" ?
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">
                    MV basis
                  </span>
                  <Link
                    href={hrefMvPool}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      squadBasis === "pool" ?
                        "bg-slate-800 text-white shadow-sm"
                      : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    All nationals
                  </Link>
                  <Link
                    href={hrefMvCallups}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      squadBasis === "callups" ?
                        "bg-slate-800 text-white shadow-sm"
                      : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    Called-up squad
                  </Link>
                  <form action="/countries" method="get" className="ml-1 inline-flex flex-wrap items-center gap-2">
                    <input type="hidden" name="rank" value="mv" />
                    <input type="hidden" name="squad" value={squadBasis} />
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="font-semibold text-slate-500">Season</span>
                      <select
                        name="season"
                        defaultValue={seasonLabel}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900"
                      >
                        {(seasonsRows ?? []).map((s) => (
                          <option key={s.label} value={s.label}>
                            {s.label}
                          </option>
                        ))}
                        {seasonLabel && !(seasonsRows ?? []).some((s) => s.label === seasonLabel) ?
                          <option value={seasonLabel}>{seasonLabel}</option>
                        : null}
                      </select>
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-900"
                    >
                      Apply
                    </button>
                  </form>
                </div>
              : null}
              <p className="mt-2 text-xs text-slate-600">
                {rankBy === "rating" ?
                  <>
                    Net rating from all completed international fixtures: wins add points (with extra weight in semis
                    and finals), draws add 1, losses subtract (heavier in knockouts). Rating can go negative. Sorted by
                    rating, then W−L, then name.{" "}
                    <strong className="font-semibold text-slate-700">WC column:</strong> odd seasons (Season 1, 3, …)
                    show TBD; even seasons (Season 2, 4, …) show{" "}
                    <span className="whitespace-nowrap font-semibold text-emerald-800">Q</span> (qualified for this
                    season&apos;s World Cup) or{" "}
                    <span className="whitespace-nowrap font-semibold text-red-700">E</span> (not in the top two of a
                    regional group in the prior season, or not in WC entries). Gold stars are FIFA World Cup titles.
                  </>
                : squadBasis === "pool" ?
                  <>
                    Sum of <strong>market value</strong> for every player with that nationality (full pool). Sorted by
                    total descending. WC column uses the same season as the URL / current season (even seasons: Q or E
                    from World Cup entries or prior regional groups; odd: TBD). Gold stars are World Cup titles.
                  </>
                : <>
                    Sum of <strong>market value</strong> for the season&apos;s three call-up slots per nation. Uses
                    season{" "}
                    <span className="font-mono font-semibold text-slate-800">{seasonLabel || "—"}</span>. Sorted by
                    total descending. Same WC / star legend as rating mode.
                  </>}
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[320px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Team</th>
                      <th
                        className="py-2 pr-3 text-center"
                        title="World Cup qualification for this season (UEFA / FIFA teams only)"
                      >
                        WC
                      </th>
                      <th className="py-2 pr-3">Confed.</th>
                      {rankBy === "rating" ?
                        <>
                          <th className="py-2 text-right">Rtg</th>
                          <th className="py-2 text-right">W</th>
                          <th className="py-2 text-right">D</th>
                          <th className="py-2 text-right">L</th>
                        </>
                      : <th className="py-2 text-right">MV</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rankingSorted.map((t, i) => {
                      const c = t.countries as
                        | { code: string; flag_emoji?: string | null }
                        | { code: string; flag_emoji?: string | null }[]
                        | null;
                      const countryRow = Array.isArray(c) ? c[0] : c;
                      const codeRaw = countryRow?.code;
                      const code =
                        typeof codeRaw === "string" ? codeRaw.toLowerCase() : "";
                      const p = pointsByNt.get(t.id);
                      const mvVal =
                        squadBasis === "callups" ? (callupMvByNtId.get(t.id) ?? 0) : (poolMvByNtId.get(t.id) ?? 0);
                      const rowFlag =
                        (countryRow?.flag_emoji as string | null) ??
                        (t.flag_emoji as string | null) ??
                        "🏳️";
                      const worldCupStars = countSeasonsWithTrophySlug(
                        t.trophies,
                        "world_cup",
                        trophyDefMap,
                      );
                      return (
                        <tr key={t.id} className="border-t border-slate-100">
                          <td className="py-2.5 pr-3 font-mono text-slate-500">{i + 1}</td>
                          <td className="py-2.5 pr-3 font-semibold text-slate-900">
                            <Link
                              href={`/countries/${code}`}
                              className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 hover:text-emerald-800 hover:underline"
                            >
                              <span className="inline-flex shrink-0 items-center gap-2">
                                <span>{rowFlag}</span>
                                <span>{t.name}</span>
                              </span>
                              <TrophyTitleStars count={worldCupStars} label="FIFA World Cup titles" />
                            </Link>
                          </td>
                          <td className="py-2.5 pr-3 text-center align-middle">
                            <FederationWcQualBadge
                              confederation={t.confederation}
                              nationalTeamId={t.id as string}
                            />
                          </td>
                          <td className="py-2.5 pr-3 text-xs font-semibold uppercase text-slate-500">
                            {t.confederation}
                          </td>
                          {rankBy === "rating" ?
                            <>
                              <td className="py-2.5 text-right font-mono font-bold tabular-nums">
                                {p?.rating ?? 0}
                              </td>
                              <td className="py-2.5 text-right font-mono tabular-nums text-slate-600">
                                {p?.won ?? 0}
                              </td>
                              <td className="py-2.5 text-right font-mono tabular-nums text-slate-600">
                                {p?.drawn ?? 0}
                              </td>
                              <td className="py-2.5 text-right font-mono tabular-nums text-slate-600">
                                {p?.lost ?? 0}
                              </td>
                            </>
                          : <td className="py-2.5 text-right font-mono font-bold tabular-nums text-slate-900">
                              {formatMoneyPounds(mvVal)}
                            </td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">UEFA</h2>
              <p className="mt-1 text-sm text-slate-600">European national teams in this sim.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {uefa.map((t) => (
                  <NtCard key={t.id} t={t} rankMode={rankBy} squadMode={squadBasis} />
                ))}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">FIFA</h2>
              <p className="mt-1 text-sm text-slate-600">Rest-of-world national teams (non-UEFA) in this sim.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {fifa.map((t) => (
                  <NtCard key={t.id} t={t} rankMode={rankBy} squadMode={squadBasis} />
                ))}
              </div>
            </section>

            {otherConf.length > 0 ?
              <section className="mt-10">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Other confederations</h2>
                <p className="mt-1 text-sm text-slate-600">Additional national teams not under UEFA or FIFA labels.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {otherConf.map((t) => (
                    <NtCard key={t.id} t={t} rankMode={rankBy} squadMode={squadBasis} />
                  ))}
                </div>
              </section>
            : null}
          </>
        }
      </div>
    </div>
  );
}
