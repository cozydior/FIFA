"use client";

import { History } from "lucide-react";
import { competitionBrandLogo } from "@/lib/competitionLogos";
import { cupLogoForCountry, cupNameForCountry } from "@/lib/countryCups";
import { formatLeagueNameForDisplay } from "@/lib/trophyCabinet";
import { TwoRowHistoryPager } from "@/components/TwoRowHistoryPager";

export type SeasonHistoryRowProps = {
  season: string;
  leagueName: string;
  division: string;
  leagueLogoUrl: string | null;
  country: string;
  pos: number;
  pts: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  cupRound: string | null;
  cupWon: boolean;
  clRound: string | null;
  clWon: boolean;
};

function SeasonHistoryRow({ r }: { r: SeasonHistoryRowProps }) {
  const tone =
    r.pos === 1 ? "from-amber-50 to-amber-100/80 border-amber-200/90 ring-amber-200/50"
    : r.pos === 2 ? "from-slate-50 to-slate-100/70 border-slate-200/90 ring-slate-200/50"
    : r.pos === 3 ? "from-orange-50/90 to-amber-50/50 border-orange-200/80 ring-orange-100/60"
    : "from-white to-slate-50/90 border-slate-200/80 ring-slate-100/50";

  const cupName = cupNameForCountry(r.country);
  const cupLogoUrl = cupLogoForCountry(r.country);
  const cupLabel =
    r.cupRound === "F" ? (r.cupWon ? `Won the ${cupName}` : `${cupName} Final`)
    : r.cupRound === "SF" ? `${cupName} Semi-final`
    : r.cupRound === "QF" ? `${cupName} Quarter-final`
    : r.cupRound ? `${cupName} (${r.cupRound})`
    : null;

  const clLabel =
    r.clRound === "CL_F" ? (r.clWon ? "Champions League Winner" : "CL Final")
    : r.clRound === "CL_SF1" || r.clRound === "CL_SF2" ? "CL Semi-final"
    : r.clRound === "CL_GA" || r.clRound === "CL_GB" ? "CL Group stage"
    : null;

  return (
    <div className={`rounded-xl border bg-gradient-to-r p-3 shadow-sm ring-1 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-lg bg-white/80 px-2 py-0.5 font-mono text-xs font-bold text-slate-600 ring-1 ring-slate-200/80">
            {r.season}
          </span>
          {r.leagueLogoUrl ?
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={r.leagueLogoUrl}
              alt=""
              className="h-8 w-8 shrink-0 rounded-lg border border-slate-200/80 bg-white object-contain p-0.5 shadow-sm"
            />
          : null}
          <span className="min-w-0 font-semibold text-slate-900">
            {formatLeagueNameForDisplay(r.leagueName)}{" "}
            <span className="font-normal text-slate-600">{r.division}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-black tabular-nums shadow-inner ${
              r.pos === 1 ? "bg-amber-400 text-amber-950"
              : r.pos === 2 ? "bg-slate-300 text-slate-900"
              : r.pos === 3 ? "bg-orange-300 text-orange-950"
              : "bg-white text-slate-800 ring-1 ring-slate-200"
            }`}
            title="League position"
          >
            {r.pos}
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span>
          <strong className="text-slate-800">{r.pts}</strong> pts
        </span>
        <span className="font-mono">
          {r.played} played · {r.won}W-{r.drawn}D-{r.lost}L
        </span>
      </div>
      {(cupLabel || clLabel) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {cupLabel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200/80 bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-800">
              {cupLogoUrl ?
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cupLogoUrl} alt="" className="h-4 w-4 rounded object-contain" />
              : null}
              {cupLabel}
            </span>
          )}
          {clLabel && (() => {
            const clLogoUrl = competitionBrandLogo("champions_league");
            return (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${r.clWon ? "border-amber-300/80 bg-amber-50 text-amber-800" : "border-sky-200/80 bg-sky-50 text-sky-800"}`}
              >
                {clLogoUrl ?
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={clLogoUrl} alt="" className="h-4 w-4 rounded object-contain" />
                : null}
                {clLabel}
              </span>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export function SeasonHistoryPager({ rows }: { rows: SeasonHistoryRowProps[] }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/95 via-white to-emerald-50/30 px-4 py-4 shadow-md ring-1 ring-slate-200/60">
      <TwoRowHistoryPager
        items={rows}
        header={
          <>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
              <History className="h-4 w-4 shrink-0 text-emerald-600" />
              Season history
            </p>
            <p className="mt-1 text-[0.7rem] text-slate-500">
              Latest season shown first — use arrows for older seasons.
            </p>
          </>
        }
        empty={<p className="mt-3 text-sm text-slate-500">No completed league seasons yet.</p>}
        renderItem={(r) => <SeasonHistoryRow r={r} />}
        className="flex min-h-0 flex-1 flex-col"
      />
    </div>
  );
}
