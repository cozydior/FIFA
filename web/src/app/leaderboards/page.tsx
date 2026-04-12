import Link from "next/link";
import { BarChart3, Goal, Shield } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { fetchSeasonSavedMatchLeaderboards } from "@/lib/seasonLeaderboards";
import { PlayerAvatar } from "@/components/PlayerAvatar";

export const revalidate = 60;

type Scope =
  | "all"
  | "champions_league"
  | "league"
  | "regional_cup";

function parseScope(v: string | undefined): Scope {
  if (v === "champions_league" || v === "league" || v === "regional_cup") return v;
  return "all";
}

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const season =
    typeof sp.season === "string" && sp.season.trim()
      ? sp.season.trim()
      : (await getCurrentSeasonLabel()) ?? "";
  const scope = parseScope(typeof sp.scope === "string" ? sp.scope : undefined);
  const leagueId = typeof sp.leagueId === "string" && sp.leagueId.trim() ? sp.leagueId.trim() : "";
  const cupCountry =
    typeof sp.cupCountry === "string" && sp.cupCountry.trim() ? sp.cupCountry.trim() : "";

  const supabase = getSupabaseAdmin();
  const [{ data: seasons }, { data: leagues }, { data: countries }] = await Promise.all([
    supabase.from("seasons").select("label").order("created_at", { ascending: false }),
    supabase.from("leagues").select("id, name, country, division").order("country"),
    supabase.from("countries").select("name").order("name"),
  ]);

  let topScorers: { playerId: string; goals: number; name: string; role: string | null; pic: string | null; team: string | null; logo: string | null }[] = [];
  let topSavers: { playerId: string; saves: number; name: string; role: string | null; pic: string | null; team: string | null; logo: string | null }[] = [];

  if (season) {
    const raw = await fetchSeasonSavedMatchLeaderboards(supabase, {
      seasonLabel: season,
      competition:
        scope === "all" ? null
        : scope === "league" ? "league"
        : scope,
      leagueId: scope === "league" && leagueId ? leagueId : null,
      cupCountry: scope === "regional_cup" && cupCountry ? cupCountry : null,
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

    topScorers = raw.topScorers.map((r) => {
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
    });
    topSavers = raw.topSavers.map((r) => {
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
    });
  }

  const scopeDescription =
    scope === "all" ? "All competitions (saved Matchday games with a fixture link)"
    : scope === "champions_league" ? "Champions League fixtures only"
    : scope === "regional_cup" ?
      cupCountry ?
        `Domestic cup in ${cupCountry}`
      : "Pick a country for the regional cup"
    : leagueId ?
      (leagues ?? []).find((l) => l.id === leagueId)?.name ?? "Selected league"
    : "Choose a league below";

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)]">
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <header className="mb-8 overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white shadow-md">
                <BarChart3 className="h-7 w-7" />
              </div>
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-emerald-700">
                  Matchday stats
                </p>
                <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
                  Goal & save leaderboards
                </h1>
                <p className="mt-2 max-w-xl text-sm text-slate-600">
                  Rankings from <strong>saved</strong> simulations where player goals/saves were stored. Play
                  league, cup, or international fixtures from Matchday — stats aggregate here by scope.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link
                href="/rankings"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-800 hover:border-emerald-300"
              >
                Player rankings →
              </Link>
              <Link
                href="/dashboard"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-800 hover:border-emerald-300"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        <form
          method="get"
          className="mb-8 flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500">
              Season
              <select
                name="season"
                defaultValue={season}
                className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-medium"
              >
                {(seasons ?? []).map((s) => (
                  <option key={s.label} value={s.label}>
                    {s.label}
                  </option>
                ))}
                {season && !seasons?.some((s) => s.label === season) ?
                  <option value={season}>{season}</option>
                : null}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500">
              Scope
              <select
                name="scope"
                defaultValue={scope}
                className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-medium"
              >
                <option value="all">Everything</option>
                <option value="league">Domestic league</option>
                <option value="champions_league">Champions League</option>
                <option value="regional_cup">Regional cup</option>
              </select>
            </label>
            {scope === "league" ?
              <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500">
                League
                <select
                  name="leagueId"
                  defaultValue={leagueId}
                  className="min-w-[12rem] rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {(leagues ?? []).map((L) => (
                    <option key={L.id} value={L.id}>
                      {L.name} ({L.country})
                    </option>
                  ))}
                </select>
              </label>
            : null}
            {scope === "regional_cup" ?
              <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500">
                Cup country
                <select
                  name="cupCountry"
                  defaultValue={cupCountry}
                  className="min-w-[10rem] rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="">Any / pick…</option>
                  {(countries ?? []).map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            : null}
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              Apply
            </button>
          </div>
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{scopeDescription}</span>
          </p>
        </form>

        {!season ?
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-600">
            No season available.
          </p>
        : (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-emerald-200/90 bg-gradient-to-b from-white to-emerald-50/40 shadow-md">
              <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50/80 px-4 py-3">
                <Goal className="h-5 w-5 text-emerald-700" />
                <h2 className="text-sm font-black uppercase tracking-wide text-emerald-950">Top scorers</h2>
              </div>
              <ol className="divide-y divide-emerald-100/80">
                {topScorers.length === 0 ?
                  <li className="px-4 py-8 text-center text-sm text-slate-500">
                    No goal data for this filter yet — complete matches from Matchday with saved reports.
                  </li>
                : topScorers.map((r, i) => (
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
            </section>

            <section className="overflow-hidden rounded-2xl border border-sky-200/90 bg-gradient-to-b from-white to-sky-50/40 shadow-md">
              <div className="flex items-center gap-2 border-b border-sky-100 bg-sky-50/80 px-4 py-3">
                <Shield className="h-5 w-5 text-sky-700" />
                <h2 className="text-sm font-black uppercase tracking-wide text-sky-950">Top keepers (saves)</h2>
              </div>
              <ol className="divide-y divide-sky-100/80">
                {topSavers.length === 0 ?
                  <li className="px-4 py-8 text-center text-sm text-slate-500">
                    No save data for this filter yet.
                  </li>
                : topSavers.map((r, i) => (
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
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
