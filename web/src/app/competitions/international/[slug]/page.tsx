import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  computeInternationalTable,
  fetchInternationalSavesByNationalTeam,
} from "@/lib/international";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { getSimPreviewTestMode, getTournamentsMode } from "@/lib/appSettings";
import { InternationalTournamentActionBar } from "@/components/InternationalTournamentActionBar";
import { InternationalCompetitionClient } from "../InternationalCompetitionClient";
import { CompetitionBrandLogo } from "@/components/CompetitionBrandLogo";
import { NationalTeamHonourLink } from "@/components/NationalTeamHonourLink";
import { fetchInternationalRollOfHonour } from "@/lib/competitionHistory";
import { IntlKnockoutBracket, type IntlKoFixture } from "@/components/IntlKnockoutBracket";
import { formatFixtureCalendarLabel } from "@/lib/calendarPhases";
import { TournamentGroupStageTable } from "@/components/TournamentGroupStageTable";
import { LEAGUE_STYLE_TIEBREAK_BLURB } from "@/lib/standings";
import { sortInternationalGroupNames } from "@/lib/internationalGroupOrder";

const TITLES: Record<string, string> = {
  nations_league: "UEFA Nations League",
  gold_cup: "FIFA Gold Cup",
  world_cup: "FIFA World Cup",
  friendlies: "Friendlies",
};

function nationalTeamDisplayFlag(
  row: { display_flag?: string; flag_emoji?: string | null } | undefined,
): string {
  return row?.display_flag ?? row?.flag_emoji ?? "🏳️";
}

export const revalidate = 60;

export default async function InternationalCompetitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  if (!TITLES[slug]) notFound();

  const sp = (await searchParams) ?? {};
  const seasonFromUrl = typeof sp.season === "string" ? sp.season : "";
  const currentSeason = await getCurrentSeasonLabel();
  const season = seasonFromUrl.trim() || currentSeason;
  const honoursView = sp.view === "honours";
  const previewEnabled = await getSimPreviewTestMode();
  const tournamentsMode = await getTournamentsMode();
  const allowIntlBootstrap = slug === "world_cup" || (slug !== "friendlies" && tournamentsMode);

  if (!season) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-extrabold text-slate-900">
          <CompetitionBrandLogo slug={slug} className="h-12 w-12" />
          <span>{TITLES[slug]}</span>
        </h1>
        <p className="mt-3 text-sm text-slate-700">
          No season selected. Create/set a current season in Admin first.
        </p>
      </div>
    );
  }

  const supabase = getSupabaseAdmin();

  const rollOfHonour =
    honoursView ?
      await fetchInternationalRollOfHonour(
        supabase,
        slug as "nations_league" | "gold_cup" | "world_cup" | "friendlies",
      )
    : null;

  const { data: comp } = await supabase
    .from("international_competitions")
    .select("id, name")
    .eq("season_label", season)
    .eq("slug", slug)
    .maybeSingle();

  const { data: seasons } = await supabase
    .from("seasons")
    .select("label")
    .order("created_at", { ascending: false });

  const fixtures =
    comp
      ? (
          await supabase
            .from("international_fixtures")
            .select(
              "id, week, stage, group_name, status, home_score, away_score, home_national_team_id, away_national_team_id, score_detail",
            )
            .eq("competition_id", comp.id)
            .order("week")
        ).data ?? []
      : [];
  const entries =
    comp
      ? (
          await supabase
            .from("international_entries")
            .select("national_team_id")
            .eq("competition_id", comp.id)
        ).data ?? []
      : [];
  const nts =
    (
      await supabase
        .from("national_teams")
        .select("id, name, flag_emoji, countries(code, flag_emoji)")
        .order("name")
    ).data ?? [];

  const intlTeamSaves = await fetchInternationalSavesByNationalTeam(
    supabase,
    season,
    slug,
  );
  const table = computeInternationalTable(
    entries.map((e) => e.national_team_id),
    fixtures,
    { teamSaves: intlTeamSaves },
  );
  const groupFixtures = fixtures.filter((f) => (f as { stage?: string }).stage === "group");
  const wcHidePhantomStandings = slug === "world_cup" && groupFixtures.length === 0;
  const tableForStandings = wcHidePhantomStandings ? [] : table;
  const byId = new Map(
    nts.map((t) => {
      const c = t.countries as
        | { code?: string | null; flag_emoji?: string | null }
        | { code?: string | null; flag_emoji?: string | null }[]
        | null;
      const country = Array.isArray(c) ? c[0] : c;
      const flag =
        (country?.flag_emoji as string | null) ??
        (t.flag_emoji as string | null) ??
        "🏳️";
      return [
        t.id,
        {
          ...t,
          display_flag: flag,
          countryCode: country?.code ?? null,
        },
      ] as const;
    }),
  );
  const groupsDone =
    groupFixtures.length === 0 ||
    groupFixtures.every((f: any) => f.status === "completed");
  const groups = sortInternationalGroupNames(
    [...new Set(groupFixtures.map((f: any) => f.group_name).filter(Boolean))] as string[],
  );
  const groupTables = groups.map((g) => {
    const gf = groupFixtures.filter((f: any) => f.group_name === g);
    const ids = [...new Set(gf.flatMap((f: any) => [f.home_national_team_id, f.away_national_team_id]))];
    return {
      group: g,
      table: computeInternationalTable(ids, gf as any, { teamSaves: intlTeamSaves }),
    };
  });
  const knockoutFixtures = fixtures.filter(
    (f: any) => (f as any).stage !== "group" && groupsDone,
  );
  const knockoutBracketData: IntlKoFixture[] = knockoutFixtures.map((f: any) => {
    const h = byId.get(f.home_national_team_id) as
      | { name?: string; display_flag?: string; countryCode?: string | null }
      | undefined;
    const a = byId.get(f.away_national_team_id) as typeof h;
    const detail = f.score_detail as { displayLine?: string } | null;
    return {
      id: f.id,
      week: f.week,
      stage: String(f.stage),
      status: f.status,
      home_score: f.home_score,
      away_score: f.away_score,
      home: h?.name ?? f.home_national_team_id,
      away: a?.name ?? f.away_national_team_id,
      homeFlag: nationalTeamDisplayFlag(h),
      awayFlag: nationalTeamDisplayFlag(a),
      homeCode: h?.countryCode ?? null,
      awayCode: a?.countryCode ?? null,
      scoreDisplay: typeof detail?.displayLine === "string" ? detail.displayLine : null,
    };
  });

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6 border-b border-slate-300/80 pb-6">
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-extrabold tracking-tight text-slate-900">
          <CompetitionBrandLogo slug={slug} className="h-14 w-14 sm:h-16 sm:w-16" />
          <span>{TITLES[slug]}</span>
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <form action={`/competitions/international/${slug}`} className="flex items-center gap-2">
            <select
              name="season"
              defaultValue={season}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
            >
              {(seasons ?? []).map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
            {honoursView ? <input type="hidden" name="view" value="honours" /> : null}
            <button className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm font-semibold">
              Go
            </button>
          </form>
          <Link href="/competitions/international" className="font-semibold text-emerald-700 hover:underline">
            Back to international hub
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/competitions/international/${slug}?season=${encodeURIComponent(season)}`}
            className={
              honoursView ?
                "rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-emerald-500"
              : "rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
            }
          >
            This season
          </Link>
          <Link
            href={`/competitions/international/${slug}?season=${encodeURIComponent(season)}&view=honours`}
            className={
              honoursView ?
                "rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
              : "rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-emerald-500"
            }
          >
            Past winners
          </Link>
        </div>
      </header>

      {honoursView && rollOfHonour !== null ?
        <section className="mb-8 rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">Roll of honour</h2>
          <p className="mt-1 text-sm text-slate-600">
            Winner and runner-up from each completed final (stage F) stored for this tournament.
          </p>
          {rollOfHonour.length === 0 ?
            <p className="mt-4 text-sm text-slate-500">No completed finals on file yet.</p>
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
                  {rollOfHonour.map((r) => (
                    <tr key={r.seasonLabel} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.seasonLabel}</td>
                      <td className="px-3 py-2">
                        <NationalTeamHonourLink team={r.winner} />
                      </td>
                      <td className="px-3 py-2 text-slate-800">
                        {r.runnerUp ?
                          <NationalTeamHonourLink
                            team={r.runnerUp}
                            className="inline-flex items-center text-slate-800"
                          />
                        : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      : null}

      {!honoursView && slug !== "friendlies" ?
        <>
          <InternationalTournamentActionBar
            slug={slug as "nations_league" | "gold_cup" | "world_cup"}
            seasonLabel={season}
            previewEnabled={previewEnabled}
            allowBootstrap={allowIntlBootstrap}
          />
          <InternationalCompetitionClient
            slug={slug as "nations_league" | "gold_cup" | "world_cup"}
            seasonLabel={season}
          />
        </>
      : null}

      {!honoursView && !comp ?
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-700">
          {slug === "friendlies" ?
            <>
              No friendlies for this season yet. Open{" "}
              <Link href="/dashboard" className="font-semibold text-emerald-800 hover:underline">
                Dashboard
              </Link>{" "}
              → International → <strong>Friendlies</strong> and use <strong>Generate friendlies</strong>.
            </>
          : <>
              No competition generated for this season yet. Click “Generate competitions”.
            </>}
        </p>
      : !honoursView ? (
        <div className="flex flex-col gap-6">
          {slug !== "friendlies" ?
            <section className="overflow-hidden rounded-2xl border border-slate-300/90 bg-white shadow-sm">
              <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-600">
                Standings
              </h2>
              {slug === "world_cup" && wcHidePhantomStandings && entries.length > 0 ?
                <p className="border-b border-slate-100 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                  {entries.length >= 8 ?
                    <>
                      Eight qualifiers are registered for this season. The group table appears after you run{" "}
                      <strong>Draw World Cup groups</strong> (dashboard or tournament bar) — not from entries alone.
                    </>
                  : <>
                      {entries.length} World Cup qualifier
                      {entries.length === 1 ? "" : "s"} registered — regional tournaments must produce eight
                      qualifiers before the draw.
                    </>}
                </p>
              : <p className="border-b border-slate-100 bg-white px-4 py-2 text-xs text-slate-600">
                  <span className="inline-flex overflow-hidden rounded-md border border-sky-200 bg-sky-50">
                    <span className="w-1 shrink-0 bg-sky-600" aria-hidden />
                    <span className="px-2 py-0.5 font-semibold text-sky-950">Top two per group · Knockouts</span>
                  </span>
                  <span className="mt-2 block text-[0.7rem] leading-snug text-slate-600">
                    {LEAGUE_STYLE_TIEBREAK_BLURB}
                  </span>
                </p>}
              {groupTables.length > 0 ?
                <div className="space-y-4 p-3">
                  {groupTables.map((g) => (
                    <div key={g.group} className="overflow-hidden rounded-xl border border-slate-200">
                      <div className="bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                        Group {g.group}
                      </div>
                      <div className="p-1">
                        <TournamentGroupStageTable
                          rows={g.table}
                          renderTeam={(r) => {
                            const t = byId.get(r.teamId);
                            return (
                              <>
                                <span className="mr-1">{nationalTeamDisplayFlag(t)}</span>
                                {t?.name ?? r.teamId}
                              </>
                            );
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              : <div className="p-1">
                  <TournamentGroupStageTable
                    rows={tableForStandings}
                    renderTeam={(r) => {
                      const t = byId.get(r.teamId);
                      return (
                        <>
                          <span className="mr-1">{nationalTeamDisplayFlag(t)}</span>
                          {t?.name ?? r.teamId}
                        </>
                      );
                    }}
                  />
                </div>
              }
            </section>
          : null}

          <section className="overflow-hidden rounded-2xl border border-slate-300/90 bg-white shadow-sm">
            <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-600">
              Fixtures
            </h2>
            <ul className="max-h-[520px] overflow-auto divide-y divide-slate-100">
              {fixtures
                .filter((f: any) => f.stage === "group" || groupsDone)
                .map((f: any) => {
                const h = byId.get(f.home_national_team_id);
                const a = byId.get(f.away_national_team_id);
                return (
                  <li key={f.id} className="px-4 py-3 text-sm">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {formatFixtureCalendarLabel(
                        f.week,
                        slug === "world_cup" ? "world_cup"
                        : slug === "friendlies" ? "friendlies"
                        : "international",
                      )}{" "}
                      {f.stage ? `· ${String(f.stage).toUpperCase()}` : ""}
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {nationalTeamDisplayFlag(h)} {h?.name ?? f.home_national_team_id}{" "}
                      <span className="font-mono">
                        {f.status === "completed" ? `${f.home_score}-${f.away_score}` : "vs"}
                      </span>{" "}
                      {nationalTeamDisplayFlag(a)} {a?.name ?? f.away_national_team_id}
                    </p>
                    {f.status === "scheduled" ?
                      <Link
                        href={`/matchday?intlFixtureId=${encodeURIComponent(f.id)}`}
                        className="mt-2 inline-block text-xs font-bold text-emerald-700 hover:underline"
                      >
                        Play in Matchday →
                      </Link>
                    : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      ) : null}
      {!honoursView &&
        knockoutBracketData.some((f) => f.stage === "SF" || f.stage === "F") && (
          <div className="mt-6">
            <IntlKnockoutBracket fixtures={knockoutBracketData} />
          </div>
        )}
    </div>
  );
}

