import { CalendarDays, Trophy, AlertCircle } from "lucide-react";
import { buildSeasonMasterFromDatabase } from "@/lib/seasonMasterData";
import {
  REGIONAL_CUP_FINAL_WEEK,
  REGIONAL_CUP_QF_WEEK,
  REGIONAL_CUP_SF_WEEK,
  type SeasonMasterRow,
} from "@/lib/seasonStructure";
import { formatLeagueNameForDisplay } from "@/lib/trophyCabinet";

export const revalidate = 30;

export default async function SeasonMasterPage() {
  let schedule: SeasonMasterRow[] = [];
  let warnings: string[] = [];
  let error: string | null = null;

  try {
    const data = await buildSeasonMasterFromDatabase();
    schedule = data.schedule;
    warnings = data.warnings;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load schedule";
  }

  const byWeek = new Map<number, SeasonMasterRow[]>();
  for (const row of schedule) {
    if (!byWeek.has(row.week)) byWeek.set(row.week, []);
    byWeek.get(row.week)!.push(row);
  }
  const weeks = [...byWeek.keys()].sort((a, b) => a - b);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-10 flex items-start gap-4 border-b border-slate-300/80 pb-8">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-600 to-blue-800 text-white shadow-md">
          <CalendarDays className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Season calendar
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
            Double round-robin (6 matchdays). Cup QF week{" "}
            <strong>{REGIONAL_CUP_QF_WEEK}</strong>, SF week{" "}
            <strong>{REGIONAL_CUP_SF_WEEK}</strong>, final week{" "}
            <strong>{REGIONAL_CUP_FINAL_WEEK}</strong>.
          </p>
        </div>
      </header>

      {error && (
        <div
          className="mb-6 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Schedule unavailable</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="mb-6 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          {warnings.map((w) => (
            <li key={w} className="py-0.5">
              {w}
            </li>
          ))}
        </ul>
      )}

      {weeks.length === 0 && !error && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white/70 px-6 py-8 text-center text-slate-600">
          No schedule rows. Seed leagues with four clubs each, then reload.
        </p>
      )}

      <div className="flex flex-col gap-10">
        {weeks.map((w) => (
          <section key={w}>
            <h2 className="mb-4 flex items-center gap-3">
              <span className="rounded-lg bg-slate-900 px-3 py-1 text-sm font-extrabold text-white shadow-sm">
                Week {w}
              </span>
              <span className="h-px flex-1 bg-slate-300" />
            </h2>
            <ul className="space-y-2">
              {(byWeek.get(w) ?? []).map((row, idx) => (
                <li
                  key={`${w}-${idx}`}
                  className="rounded-xl border border-slate-300/90 bg-white px-4 py-3 text-sm shadow-sm"
                >
                  {row.competition === "league" ?
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">
                        League
                      </span>
                      <span className="font-bold text-slate-900">
                        {formatLeagueNameForDisplay(row.leagueName)}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono text-xs text-slate-600">
                        {row.homeTeamId.slice(0, 8)}… vs{" "}
                        {row.awayTeamId.slice(0, 8)}…
                      </span>
                    </div>
                  : row.round === "QF" ?
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Trophy className="h-4 w-4 text-amber-600" />
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                        Cup QF
                      </span>
                      <span className="font-bold text-slate-900">
                        {row.country}
                      </span>
                      <span className="font-mono text-xs text-slate-600">
                        {row.homeTeamId.slice(0, 8)}… vs{" "}
                        {row.awayTeamId.slice(0, 8)}…
                      </span>
                    </div>
                  : <div className="flex flex-wrap items-center gap-2 text-slate-600">
                      <Trophy className="h-4 w-4 text-slate-400" />
                      <span className="italic">{row.label}</span>
                    </div>
                  }
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
