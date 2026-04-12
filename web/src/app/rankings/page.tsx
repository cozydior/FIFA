import Link from "next/link";
import { ListOrdered, Medal } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import {
  fetchRankingsRows,
  resolveRankingsSeason,
  type RankingsRoleFilter,
  type RankingsRow,
  type RankingsSortKey,
  type RankingsStatScope,
} from "@/lib/rankingsData";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fotMobBadgeClass, marketTrendLabel } from "@/lib/fotMobBadge";
import { formatMoneyPounds } from "@/lib/formatMoney";

export const revalidate = 60;

function parseRole(v: string | undefined): RankingsRoleFilter {
  if (v === "ST" || v === "GK" || v === "all") return v;
  return "all";
}

function parseScope(v: string | undefined): RankingsStatScope {
  const allowed: RankingsStatScope[] = [
    "career",
    "season",
    "world_cup",
    "nations_league",
    "gold_cup",
    "champions_league_proxy",
  ];
  if (v && (allowed as string[]).includes(v)) return v as RankingsStatScope;
  return "career";
}

function parseSort(v: string | undefined, role: RankingsRoleFilter): RankingsSortKey {
  const keys: RankingsSortKey[] = [
    "market_value",
    "peak_market_value",
    "career_goals",
    "career_saves",
    "season_goals",
    "season_saves",
    "scope_goals",
    "scope_saves",
    "avg_rating",
    "intl_caps",
    "intl_goals",
    "intl_saves",
  ];
  if (v && (keys as string[]).includes(v)) return v as RankingsSortKey;
  if (role === "GK") return "career_saves";
  if (role === "ST") return "career_goals";
  return "market_value";
}

export default async function RankingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const season =
    typeof sp.season === "string" && sp.season.trim()
      ? sp.season.trim()
      : await resolveRankingsSeason(null);
  const role = parseRole(typeof sp.role === "string" ? sp.role : undefined);
  const scope = parseScope(typeof sp.scope === "string" ? sp.scope : undefined);
  const sort = parseSort(typeof sp.sort === "string" ? sp.sort : undefined, role);
  const country =
    typeof sp.country === "string" && sp.country.trim() ? sp.country.trim() : "";
  const leagueId =
    typeof sp.league === "string" && sp.league.trim() ? sp.league.trim() : "";
  const freeAgentsOnly = sp.free === "1";

  const supabase = getSupabaseAdmin();
  const [{ data: seasons }, { data: leagues }, { data: countries }] = await Promise.all([
    supabase.from("seasons").select("label").order("created_at", { ascending: false }),
    supabase.from("leagues").select("id, name, country, division").order("country"),
    supabase.from("countries").select("name").order("name"),
  ]);

  const seasonLabel = season ?? "";
  let rows: Awaited<ReturnType<typeof fetchRankingsRows>> = [];
  let loadError: string | null = null;
  try {
    if (seasonLabel) {
      rows = await fetchRankingsRows({
        seasonLabel,
        roleFilter: role,
        statScope: scope,
        countryFilter: country,
        leagueIdFilter: leagueId,
        freeAgentsOnly,
        sortKey: sort,
      });
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load rankings";
  }

  const scopeNote =
    scope === "champions_league_proxy"
      ? "Uses domestic season stats as a proxy (per-player CL stats are not tracked separately yet)."
      : null;

  const statHead =
    role === "GK" ?
      scope === "career" ? "Saves (career)"
      : scope === "season" ? "Saves (season)"
      : "Saves"
    : role === "ST" ?
      scope === "career" ? "Goals (career)"
      : scope === "season" ? "Goals (season)"
      : "Goals"
    : scope === "career" ? "Goals / saves (career)"
    : scope === "season" ? "Goals / saves (season)"
    : "Goals / saves";

  function primaryStat(r: RankingsRow): string {
    if (role === "GK") return String(r.scope_saves);
    if (role === "ST") return String(r.scope_goals);
    if (r.role === "GK") return String(r.scope_saves);
    if (r.role === "ST") return String(r.scope_goals);
    if (r.scope_goals > 0 && r.scope_saves === 0) return String(r.scope_goals);
    if (r.scope_saves > 0 && r.scope_goals === 0) return String(r.scope_saves);
    return String(Math.max(r.scope_goals, r.scope_saves));
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-8 border-b border-slate-300/80 pb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-800 text-white shadow-md ring-1 ring-indigo-900/20">
              <Medal className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                Rankings & scouting
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Ballon d&apos;Or race (ST) and Palm d&apos;Or race (GK): sort by value, form stats,
                international legacy, or FotMob average. Filters help you scout free agents and
                league pipelines.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
            <Link
              href={`/leaderboards?season=${encodeURIComponent(seasonLabel)}`}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-900 hover:bg-emerald-100"
            >
              Matchday leaderboards
            </Link>
            <Link
              href={`/dashboard?season=${encodeURIComponent(seasonLabel)}&group=rankings`}
              className="text-sm font-semibold text-emerald-800 hover:underline"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <form
        method="get"
        className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-300/90 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500">
            Season (for season stats & filters)
            <select
              name="season"
              defaultValue={seasonLabel}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-900"
            >
              {(seasons ?? []).map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
              {!seasons?.some((s) => s.label === seasonLabel) && seasonLabel && (
                <option value={seasonLabel}>{seasonLabel}</option>
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500">
            Race
            <select
              name="role"
              defaultValue={role}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium"
            >
              <option value="all">All roles</option>
              <option value="ST">Ballon d&apos;Or (ST)</option>
              <option value="GK">Palm d&apos;Or (GK)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500">
            Stat scope
            <select
              name="scope"
              defaultValue={scope}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium"
            >
              <option value="career">Domestic career</option>
              <option value="season">Domestic season</option>
              <option value="world_cup">World Cup (intl)</option>
              <option value="nations_league">Nations League (intl)</option>
              <option value="gold_cup">Gold Cup (intl)</option>
              <option value="champions_league_proxy">Champions League (proxy)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500">
            Sort by
            <select
              name="sort"
              defaultValue={sort}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium"
            >
              <option value="market_value">Current MV</option>
              <option value="peak_market_value">Peak MV</option>
              <option value="career_goals">Career goals</option>
              <option value="career_saves">Career saves</option>
              <option value="season_goals">Season goals</option>
              <option value="season_saves">Season saves</option>
              <option value="scope_goals">Scope goals (tournament / proxy)</option>
              <option value="scope_saves">Scope saves (tournament / proxy)</option>
              <option value="avg_rating">Avg FotMob</option>
              <option value="intl_caps">Intl caps</option>
              <option value="intl_goals">Intl goals</option>
              <option value="intl_saves">Intl saves</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500">
            Nationality
            <select
              name="country"
              defaultValue={country}
              className="min-w-[10rem] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Any</option>
              {(countries ?? []).map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500">
            League
            <select
              name="league"
              defaultValue={leagueId}
              className="min-w-[12rem] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Any</option>
              {(leagues ?? []).map((L) => (
                <option key={L.id} value={L.id}>
                  {L.name} ({L.country} {L.division})
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" name="free" value="1" defaultChecked={freeAgentsOnly} />
            Free agents only
          </label>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm"
          >
            Apply
          </button>
        </div>
        {scopeNote && (
          <p className="text-xs text-amber-800">{scopeNote}</p>
        )}
      </form>

      {loadError && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {loadError}
        </div>
      )}

      {!seasonLabel && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-sm text-slate-600">
          Pick a season to load rankings.
        </p>
      )}

      {seasonLabel && !loadError && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/40 shadow-md ring-1 ring-slate-200/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/90 text-left text-xs uppercase tracking-wide text-slate-600">
                <th className="px-3 py-3 pl-4">#</th>
                <th className="px-3 py-3">Player</th>
                <th className="px-3 py-3">Club</th>
                <th className="px-3 py-3 text-right">Value</th>
                <th className="px-3 py-3 text-right">Trend</th>
                <th className="px-3 py-3 text-right">{statHead}</th>
                <th className="px-3 py-3 text-right">Peak</th>
                <th className="px-3 py-3 pr-4 text-right">Avg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const trend = marketTrendLabel(r.market_value_previous, r.market_value);
                const natFlag = r.nationality_flag;
                const natLink = r.nationality_code ? `/countries/${r.nationality_code}` : null;
                return (
                <tr
                  key={r.id}
                  className="border-t border-slate-100/90 transition-colors hover:bg-emerald-50/40"
                >
                  <td className="px-3 py-2.5 pl-4 font-mono text-sm text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-0 max-w-[20rem] items-center gap-2.5">
                      {natFlag && natLink ?
                        <Link
                          href={natLink}
                          className="shrink-0 text-xl leading-none hover:opacity-80"
                          title={r.nationality ?? ""}
                        >
                          {natFlag}
                        </Link>
                      : natFlag ?
                        <span className="shrink-0 text-xl leading-none" title={r.nationality ?? ""}>
                          {natFlag}
                        </span>
                      : null}
                      <Link
                        href={`/player/${r.id}`}
                        className="group flex min-w-0 flex-1 items-center gap-2"
                      >
                        <PlayerAvatar
                          name={r.name}
                          profilePicUrl={r.profile_pic_url}
                          sizeClassName="h-9 w-9 shrink-0 ring-2 ring-white shadow-sm"
                          textClassName="text-[0.65rem]"
                        />
                        <span className="min-w-0 truncate font-bold text-slate-900 group-hover:text-emerald-800 group-hover:underline">
                          {r.name}
                        </span>
                        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-slate-600">
                          {r.role}
                        </span>
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {r.team_name ?
                      <span className="inline-flex min-w-0 items-center gap-2">
                        {r.team_logo_url ?
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.team_logo_url}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-lg border border-slate-200/80 bg-white object-contain p-0.5 shadow-sm"
                          />
                        : null}
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900">{r.team_name}</span>
                          {r.league_name && (
                            <span className="block truncate text-xs text-slate-500">{r.league_name}</span>
                          )}
                        </span>
                      </span>
                    : <span className="font-medium text-amber-800">Free agent</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-900">
                    {formatMoneyPounds(r.market_value)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold">
                    <span
                      className={
                        trend === "—" ? "text-slate-400"
                        : trend.startsWith("↑") ? "text-emerald-700"
                        : trend.startsWith("↓") ? "text-red-600"
                        : "text-slate-600"
                      }
                    >
                      {trend}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900">
                    {primaryStat(r)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-600">
                    {formatMoneyPounds(r.peak_market_value)}
                  </td>
                  <td className="px-3 py-2.5 pr-4 text-right">
                    {r.sort_rating > 0 ?
                      <span className={fotMobBadgeClass(r.sort_rating)}>
                        {r.sort_rating.toFixed(1)}
                      </span>
                    : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              No players match these filters.
            </p>
          )}
        </div>
      )}

      <section className="mt-10 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-600">
          <ListOrdered className="h-4 w-4" />
          How to read this page
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>
            <strong className="font-semibold text-slate-800">Trend</strong> compares the last
            recorded value snapshot before a sim-driven market move (not a weekly calendar).
          </li>
          <li>
            <strong className="font-semibold text-slate-800">Avg</strong> uses season averages when
            scope is domestic season / CL proxy; otherwise it is a career-weighted domestic average.
          </li>
          <li>International tournaments use the international stats ledger (caps/goals/saves).</li>
        </ul>
      </section>
    </div>
  );
}
