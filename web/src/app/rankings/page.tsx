import Link from "next/link";
import { ListOrdered, Medal } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import {
  fetchRankingsRows,
  resolveRankingsSeason,
  type RankingsRoleFilter,
  type RankingsRow,
  type RankingsSortDir,
  type RankingsSortKey,
  type RankingsStatScope,
} from "@/lib/rankingsData";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fotMobBadgeClass, marketTrendLabel } from "@/lib/fotMobBadge";
import { budgetVsSquadBubbleClass } from "@/lib/budgetVsSquadTone";
import { LeagueDivisionChip } from "@/lib/divisionChip";
import { squadAnnualWageBill } from "@/lib/economy";
import { formatMoneyPounds } from "@/lib/formatMoney";
import { fetchTeamRankingsBySquadValue } from "@/lib/teamRankingsData";

export const revalidate = 60;

function parseTab(v: string | undefined): "players" | "teams" {
  return v === "teams" ? "teams" : "players";
}

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
    "mv_trend",
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

function parseSortDir(v: string | undefined): RankingsSortDir {
  return v === "asc" ? "asc" : "desc";
}

function statColumnSortKey(
  role: RankingsRoleFilter,
  scope: RankingsStatScope,
): RankingsSortKey {
  if (scope === "career") {
    return role === "GK" ? "career_saves" : "career_goals";
  }
  if (scope === "season") {
    return role === "GK" ? "season_saves" : "season_goals";
  }
  return role === "GK" ? "scope_saves" : "scope_goals";
}

function sortThClass(active: boolean): string {
  return [
    "inline-flex items-center gap-0.5 rounded px-0.5 py-0.5 font-semibold text-slate-700 no-underline transition-colors hover:bg-slate-200/80 hover:text-slate-900",
    active ? "bg-slate-200/90 text-slate-900 ring-1 ring-slate-300/80" : "",
  ].join(" ");
}

export default async function RankingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const season = await resolveRankingsSeason(null);
  const role = parseRole(typeof sp.role === "string" ? sp.role : undefined);
  const scope = parseScope(typeof sp.scope === "string" ? sp.scope : undefined);
  const sort = parseSort(typeof sp.sort === "string" ? sp.sort : undefined, role);
  const sortDir = parseSortDir(typeof sp.order === "string" ? sp.order : undefined);
  const country =
    typeof sp.country === "string" && sp.country.trim() ? sp.country.trim() : "";
  const leagueId =
    typeof sp.league === "string" && sp.league.trim() ? sp.league.trim() : "";
  const freeAgentsOnly = sp.free === "1";
  const includeFreeAgents =
    typeof sp.include_free === "string" && sp.include_free === "1";
  const tab = parseTab(typeof sp.tab === "string" ? sp.tab : undefined);

  function playersFiltersParams(): URLSearchParams {
    const p = new URLSearchParams();
    p.set("role", role);
    p.set("scope", scope);
    p.set("sort", sort);
    if (sortDir === "asc") p.set("order", "asc");
    if (country) p.set("country", country);
    if (leagueId) p.set("league", leagueId);
    if (freeAgentsOnly) p.set("free", "1");
    if (includeFreeAgents) p.set("include_free", "1");
    return p;
  }

  function rosterViewHref(showFree: boolean): string {
    const p = playersFiltersParams();
    if (showFree) p.set("include_free", "1");
    else p.delete("include_free");
    return `/rankings?${p.toString()}`;
  }

  const supabase = getSupabaseAdmin();
  const [{ data: leagues }, { data: countries }] = await Promise.all([
    supabase.from("leagues").select("id, name, country, division").order("country"),
    supabase.from("countries").select("name").order("name"),
  ]);

  const seasonLabel = season ?? "";
  let rows: Awaited<ReturnType<typeof fetchRankingsRows>> = [];
  let teamRows: Awaited<ReturnType<typeof fetchTeamRankingsBySquadValue>> = [];
  let loadError: string | null = null;
  try {
    if (seasonLabel && tab === "players") {
      rows = await fetchRankingsRows({
        seasonLabel,
        roleFilter: role,
        statScope: scope,
        countryFilter: country,
        leagueIdFilter: leagueId,
        freeAgentsOnly,
        includeFreeAgents,
        sortKey: sort,
        sortDir,
      });
    }
    if (tab === "teams") {
      teamRows = await fetchTeamRankingsBySquadValue(supabase);
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load rankings";
  }

  function rankingsHref(next: { tab?: "players" | "teams" }): string {
    if (next.tab === "teams") {
      return "/rankings?tab=teams";
    }
    const q = playersFiltersParams().toString();
    return q ? `/rankings?${q}` : "/rankings";
  }

  function playersSortHref(nextSort: RankingsSortKey): string {
    const p = playersFiltersParams();
    const nextOrder: RankingsSortDir =
      nextSort === sort ? (sortDir === "desc" ? "asc" : "desc") : "desc";
    p.set("sort", nextSort);
    if (nextOrder === "asc") p.set("order", "asc");
    else p.delete("order");
    return `/rankings?${p.toString()}`;
  }

  const scopeNote =
    scope === "champions_league_proxy"
      ? "Uses domestic season stats as a proxy (per-player CL stats are not tracked separately yet)."
      : null;

  const statHead =
    role === "GK" ?
      scope === "career" ? "Saves"
      : scope === "season" ? "Saves (season)"
      : "Saves"
    : role === "ST" ?
      scope === "career" ? "Goals"
      : scope === "season" ? "Goals (season)"
      : "Goals"
    : scope === "career" ? "Goals / saves"
    : scope === "season" ? "Goals / saves (season)"
    : "Goals / saves";

  const statSortKey = statColumnSortKey(role, scope);

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
                international legacy, or FotMob average.                 Free agents are hidden from the table by default; use{" "}
                <strong className="font-semibold text-slate-800">+ Free agents</strong> or the
                filter checkbox to show them. Filters also help you scout{" "}
                <strong className="font-semibold text-slate-800">free agents only</strong> and
                league pipelines.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
            <Link
              href={
                seasonLabel ?
                  `/leaderboards?season=${encodeURIComponent(seasonLabel)}`
                : "/leaderboards"
              }
              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-900 hover:bg-emerald-100"
            >
              Matchday leaderboards
            </Link>
            <Link
              href={
                seasonLabel ?
                  `/dashboard?season=${encodeURIComponent(seasonLabel)}&group=rankings`
                : "/dashboard?group=rankings"
              }
              className="text-sm font-semibold text-emerald-800 hover:underline"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2">
        <Link
          href={rankingsHref({ tab: "players" })}
          className={
            tab === "players" ?
              "rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm"
            : "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-400"
          }
        >
          Players
        </Link>
        <Link
          href={rankingsHref({ tab: "teams" })}
          className={
            tab === "teams" ?
              "rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm"
            : "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-400"
          }
        >
          Teams
        </Link>
      </nav>

      {tab === "players" ?
      <form
        method="get"
        className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-300/90 bg-white p-4 shadow-sm"
      >
        <input type="hidden" name="tab" value="players" />
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[10rem] flex-col gap-0.5 rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-3 py-2">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-emerald-800/90">
              Data window
            </span>
            <span className="text-sm font-bold text-slate-900">
              Live · current season
              {seasonLabel ?
                <span className="ml-1.5 font-mono text-xs font-semibold text-emerald-900">
                  {seasonLabel}
                </span>
              : null}
            </span>
            <span className="text-[0.65rem] leading-snug text-slate-600">
              Rankings always use the app&apos;s current season label (same as matchday).
            </span>
          </div>
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
              <option value="career">Full career (domestic + international)</option>
              <option value="season">Domestic season</option>
              <option value="world_cup">World Cup (intl)</option>
              <option value="nations_league">Nations League (intl)</option>
              <option value="gold_cup">Gold Cup (intl)</option>
              <option value="champions_league_proxy">Champions League (proxy)</option>
            </select>
          </label>
          <input type="hidden" name="sort" value={sort} />
          {sortDir === "asc" ? <input type="hidden" name="order" value="asc" /> : null}
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
          <label
            className={`flex items-center gap-2 text-sm font-semibold ${
              freeAgentsOnly ? "cursor-not-allowed text-slate-400" : "text-slate-700"
            }`}
            title={
              freeAgentsOnly ?
                "Turn off “Free agents only” to change this"
              : "List players without a club (off by default)"
            }
          >
            <input
              type="checkbox"
              name="include_free"
              value="1"
              defaultChecked={includeFreeAgents}
              disabled={freeAgentsOnly}
            />
            Show free agents
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
      : null}

      {tab === "players" && seasonLabel && !freeAgentsOnly && (
        <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
          <span className="font-bold uppercase tracking-wide text-slate-500">Roster</span>
          <Link
            href={rosterViewHref(false)}
            className={
              !includeFreeAgents ?
                "rounded-md bg-slate-900 px-2 py-1 font-semibold text-white"
              : "rounded-md px-2 py-1 font-semibold text-emerald-800 hover:bg-emerald-50 hover:underline"
            }
          >
            Club players
            {!includeFreeAgents ?
              <span className="ml-0.5 text-[0.65rem] font-normal opacity-80">(default)</span>
            : null}
          </Link>
          <Link
            href={rosterViewHref(true)}
            className={
              includeFreeAgents ?
                "rounded-md bg-slate-900 px-2 py-1 font-semibold text-white"
              : "rounded-md px-2 py-1 font-semibold text-emerald-800 hover:bg-emerald-50 hover:underline"
            }
          >
            + Free agents
          </Link>
        </p>
      )}

      {tab === "players" && seasonLabel && (
        <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
          <span className="font-bold uppercase tracking-wide text-slate-500">Intl sort</span>
          {(
            [
              ["intl_caps", "Caps"],
              ["intl_goals", "Goals"],
              ["intl_saves", "Saves"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={playersSortHref(key)}
              className={
                sort === key ?
                  "rounded-md bg-slate-900 px-2 py-1 font-semibold text-white"
                : "rounded-md px-2 py-1 font-semibold text-emerald-800 hover:bg-emerald-50 hover:underline"
              }
              title="Click to sort; click again to reverse"
            >
              {label}
              {sort === key ?
                <span className="ml-0.5 text-[0.65rem] font-normal opacity-80">
                  {sortDir === "desc" ? "↓" : "↑"}
                </span>
              : null}
            </Link>
          ))}
        </p>
      )}

      {loadError && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {loadError}
        </div>
      )}

      {!seasonLabel && tab === "players" && (
        <p className="rounded-xl border border-dashed border-amber-200 bg-amber-50/80 px-6 py-8 text-center text-sm text-amber-950">
          No <strong>current season</strong> is set in the app (Admin → seasons / settings). Set one
          to load player rankings.
        </p>
      )}

      {tab === "teams" && !loadError && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/40 shadow-md ring-1 ring-slate-200/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/90 text-left text-xs uppercase tracking-wide text-slate-600">
                <th className="px-3 py-3 pl-4">#</th>
                <th className="px-3 py-3">Team</th>
                <th className="px-3 py-3 text-right">Squad MV</th>
                <th className="px-3 py-3 text-right" title="Annual wage bill (50% of squad MV)">
                  Contracts
                </th>
                <th className="px-3 py-3 pr-4 text-right">Budget</th>
              </tr>
            </thead>
            <tbody>
              {teamRows.map((t, i) => (
                <tr key={t.id} className="border-t border-slate-100/90 transition-colors hover:bg-emerald-50/40">
                  <td className="px-3 py-2.5 pl-4 font-mono text-sm text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-0 flex-col gap-1">
                      <Link
                        href={`/team/${t.id}`}
                        className="inline-flex min-w-0 items-center gap-2 font-semibold text-slate-900 hover:text-emerald-800 hover:underline"
                      >
                        {t.logo_url ?
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={t.logo_url}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded-lg border border-slate-200/80 bg-white object-contain p-0.5 shadow-sm"
                          />
                        : null}
                        <span className="truncate">{t.name}</span>
                      </Link>
                      {t.league_name ?
                        <span className="flex flex-wrap items-center gap-1.5 pl-[2.75rem] text-xs text-slate-500">
                          {t.league_logo_url ?
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={t.league_logo_url}
                              alt=""
                              className="h-6 w-6 shrink-0 rounded-md border border-slate-200/80 bg-white object-contain p-0.5 shadow-sm"
                            />
                          : null}
                          <span className="min-w-0 truncate">{t.league_name}</span>
                          {t.league_country ?
                            <span className="shrink-0 text-slate-400">· {t.league_country}</span>
                          : null}
                          <LeagueDivisionChip division={t.league_division} />
                        </span>
                      : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900">
                    {formatMoneyPounds(t.squad_market_value)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold text-slate-800">
                    {formatMoneyPounds(squadAnnualWageBill(t.squad_market_value))}
                  </td>
                  <td className="px-3 py-2.5 pr-4 text-right">
                    <span
                      className={`font-mono font-semibold tabular-nums text-slate-900 ${budgetVsSquadBubbleClass(t.current_balance, t.squad_market_value)}`}
                    >
                      {formatMoneyPounds(t.current_balance)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {seasonLabel && !loadError && tab === "players" && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/40 shadow-md ring-1 ring-slate-200/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/90 text-left text-xs uppercase tracking-wide text-slate-600">
                <th className="px-3 py-3 pl-4">#</th>
                <th className="px-3 py-3">Player</th>
                <th className="px-3 py-3">Club</th>
                <th className="px-3 py-3 text-right">
                  <Link
                    href={playersSortHref("market_value")}
                    className={sortThClass(sort === "market_value")}
                    title="Click to sort; click again to reverse"
                  >
                    Value
                    {sort === "market_value" ?
                      <span className="ml-0.5 text-[0.65rem] font-normal normal-case text-slate-500">
                        {sortDir === "desc" ? "↓" : "↑"}
                      </span>
                    : null}
                  </Link>
                </th>
                <th className="px-3 py-3 text-right">
                  <Link
                    href={playersSortHref("mv_trend")}
                    className={sortThClass(sort === "mv_trend")}
                    title="Click to sort; click again to reverse"
                  >
                    Trend
                    {sort === "mv_trend" ?
                      <span className="ml-0.5 text-[0.65rem] font-normal normal-case text-slate-500">
                        {sortDir === "desc" ? "↓" : "↑"}
                      </span>
                    : null}
                  </Link>
                </th>
                <th className="px-3 py-3 text-right">
                  <Link
                    href={playersSortHref(statSortKey)}
                    className={sortThClass(sort === statSortKey)}
                    title="Click to sort; click again to reverse"
                  >
                    {statHead}
                    {sort === statSortKey ?
                      <span className="ml-0.5 text-[0.65rem] font-normal normal-case text-slate-500">
                        {sortDir === "desc" ? "↓" : "↑"}
                      </span>
                    : null}
                  </Link>
                </th>
                <th className="px-3 py-3 text-right">
                  <Link
                    href={playersSortHref("peak_market_value")}
                    className={sortThClass(sort === "peak_market_value")}
                    title="Click to sort; click again to reverse"
                  >
                    Peak
                    {sort === "peak_market_value" ?
                      <span className="ml-0.5 text-[0.65rem] font-normal normal-case text-slate-500">
                        {sortDir === "desc" ? "↓" : "↑"}
                      </span>
                    : null}
                  </Link>
                </th>
                <th className="px-3 py-3 pr-4 text-right">
                  <Link
                    href={playersSortHref("avg_rating")}
                    className={sortThClass(sort === "avg_rating")}
                    title="Click to sort; click again to reverse"
                  >
                    Avg
                    {sort === "avg_rating" ?
                      <span className="ml-0.5 text-[0.65rem] font-normal normal-case text-slate-500">
                        {sortDir === "desc" ? "↓" : "↑"}
                      </span>
                    : null}
                  </Link>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const trend = marketTrendLabel(r.mv_prior_season, r.market_value);
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
                    {r.team_name && r.team_id ?
                      <Link
                        href={`/team/${r.team_id}`}
                        className="inline-flex min-w-0 items-center gap-2 rounded-lg py-0.5 hover:bg-slate-100/80"
                      >
                        {r.team_logo_url ?
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.team_logo_url}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-lg border border-slate-200/80 bg-white object-contain p-0.5 shadow-sm"
                          />
                        : null}
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900 underline-offset-2 hover:text-emerald-800 hover:underline">
                            {r.team_name}
                          </span>
                          {r.league_name && (
                            <span className="block truncate text-xs text-slate-500">{r.league_name}</span>
                          )}
                        </span>
                      </Link>
                    : r.team_name ?
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
            Click <strong className="font-semibold text-slate-800">Value</strong>,{" "}
            <strong className="font-semibold text-slate-800">Trend</strong>,{" "}
            <strong className="font-semibold text-slate-800">Peak</strong>,{" "}
            <strong className="font-semibold text-slate-800">Avg</strong>, or the goals/saves column
            header to sort (defaults high → low). Click the <em>same</em> header again to flip to low
            → high. <strong className="font-semibold text-slate-800">Trend</strong>{" "}
            compares live MV to the stored value for the <em>previous</em> season label (from MV
            history), not match-to-match bumps (rookies / first season with no prior row sort last).
          </li>
          <li>
            <strong className="font-semibold text-slate-800">Wages</strong> use each club&apos;s live
            squad MV (50% bill) — the same <code className="rounded bg-slate-100 px-1 font-mono text-xs">players.market_value</code>{" "}
            figures, including in-season bumps after matches.
          </li>
          <li>
            <strong className="font-semibold text-slate-800">End-of-season bundle</strong> can still
            recalculate every player&apos;s MV from <em>hidden OVR only</em> (baseline curve). That is
            separate from per-match form bumps and is useful when you want values to snap to ratings
            at year-end — it is not redundant with match-by-match updates.
          </li>
          <li>
            <strong className="font-semibold text-slate-800">Avg</strong> uses season averages when
            scope is domestic season / CL proxy; otherwise it is a career-weighted domestic average.
          </li>
          <li>
            International tournaments use the international stats ledger (caps/goals/saves). The main stat column for
            <strong className="font-semibold text-slate-800"> Full career</strong> adds international goals and saves to
            domestic totals.
          </li>
          <li>
            <strong className="font-semibold text-slate-800">Club players</strong> (default) hides
            players without a club from the rankings table.{" "}
            <strong className="font-semibold text-slate-800">+ Free agents</strong> or{" "}
            <strong className="font-semibold text-slate-800">Show free agents</strong> in Apply
            filters includes them. <strong className="font-semibold text-slate-800">Free agents only</strong>{" "}
            narrows the list to unattached players.
          </li>
        </ul>
      </section>
    </div>
  );
}
