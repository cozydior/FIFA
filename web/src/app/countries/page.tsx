import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { countryCodeToFlagEmoji } from "@/lib/flags";
import { hasDomesticClubFootball } from "@/lib/dashboardLinks";
import { computeNationalTeamPointsFromFixtures } from "@/lib/nationalTeamRanking";

export const revalidate = 60;

export default async function NationalTeamsIndexPage() {
  const supabase = getSupabaseAdmin();
  const [{ data: ntsRaw }, { data: intlFx }] = await Promise.all([
    supabase
      .from("national_teams")
      .select("id, name, confederation, flag_emoji, countries(code, name, flag_emoji)"),
    supabase
      .from("international_fixtures")
      .select(
        "home_national_team_id, away_national_team_id, home_score, away_score, stage, status",
      )
      .eq("status", "completed"),
  ]);

  const pointsRows = computeNationalTeamPointsFromFixtures(intlFx ?? []);
  const pointsByNt = new Map(pointsRows.map((r) => [r.nationalTeamId, r]));

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

  function NtCard({ t }: { t: (typeof nts)[0] }) {
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
        <p className="mt-2 font-mono text-sm font-bold tabular-nums text-slate-800">
          {pts ? `${pts.rating} rating` : "0 rating"}
          {pts && pts.played > 0 ?
            <span className="ml-2 font-sans text-xs font-medium text-slate-500">
              ({pts.won}-{pts.drawn}-{pts.lost})
            </span>
          : null}
        </p>
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
              <h2 className="text-lg font-bold text-slate-900">Federation ranking (rating)</h2>
              <p className="mt-1 text-xs text-slate-600">
                Net rating from all completed international fixtures: wins add points (with extra weight in semis and
                finals), draws add 1, losses subtract (heavier in knockouts). Rating can go negative. Sorted by rating,
                then W−L, then name.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[320px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Team</th>
                      <th className="py-2 pr-3">Confed.</th>
                      <th className="py-2 text-right">Rtg</th>
                      <th className="py-2 text-right">P</th>
                      <th className="py-2 text-right">W</th>
                      <th className="py-2 text-right">D</th>
                      <th className="py-2 text-right">L</th>
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
                      const rowFlag =
                        (countryRow?.flag_emoji as string | null) ??
                        (t.flag_emoji as string | null) ??
                        "🏳️";
                      return (
                        <tr key={t.id} className="border-t border-slate-100">
                          <td className="py-2.5 pr-3 font-mono text-slate-500">{i + 1}</td>
                          <td className="py-2.5 pr-3 font-semibold text-slate-900">
                            <Link
                              href={`/countries/${code}`}
                              className="inline-flex items-center gap-2 hover:text-emerald-800 hover:underline"
                            >
                              <span>{rowFlag}</span>
                              {t.name}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-3 text-xs font-semibold uppercase text-slate-500">
                            {t.confederation}
                          </td>
                          <td className="py-2.5 text-right font-mono font-bold tabular-nums">
                            {p?.rating ?? 0}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-slate-600">
                            {p?.played ?? 0}
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
                  <NtCard key={t.id} t={t} />
                ))}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">FIFA</h2>
              <p className="mt-1 text-sm text-slate-600">Rest-of-world national teams (non-UEFA) in this sim.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {fifa.map((t) => (
                  <NtCard key={t.id} t={t} />
                ))}
              </div>
            </section>

            {otherConf.length > 0 ?
              <section className="mt-10">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Other confederations</h2>
                <p className="mt-1 text-sm text-slate-600">Additional national teams not under UEFA or FIFA labels.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {otherConf.map((t) => (
                    <NtCard key={t.id} t={t} />
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
