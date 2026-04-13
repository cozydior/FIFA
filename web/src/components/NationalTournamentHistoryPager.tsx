"use client";

import Link from "next/link";
import type { NationalTournamentFinish } from "@/lib/nationalTournamentHistory";
import { TwoRowHistoryPager } from "@/components/TwoRowHistoryPager";
import { History } from "lucide-react";

function Row({ row }: { row: NationalTournamentFinish }) {
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
    <div className="px-4 py-3 sm:px-5">
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
    </div>
  );
}

export function NationalTournamentHistoryPager({
  rows,
  emptyMessage,
}: {
  rows: NationalTournamentFinish[];
  emptyMessage: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      <div className="shrink-0 border-b border-slate-100 px-5 py-4">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
          <History className="h-4 w-4 shrink-0 text-emerald-600" />
          Tournament history
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Latest tournament shown first — use arrows for older entries.
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-slate-50/40 px-3 py-3 sm:px-4">
        <TwoRowHistoryPager
          items={rows}
          renderItem={(row) => <Row row={row} />}
          empty={<p className="px-3 py-6 text-sm text-slate-500">{emptyMessage}</p>}
          className=""
        />
      </div>
    </div>
  );
}
