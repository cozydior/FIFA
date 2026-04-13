"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/**
 * Paginates history lists (newest first). Default: one entry per page; use < > for older/newer.
 */
export function TwoRowHistoryPager<T>({
  items,
  pageSize = 1,
  renderItem,
  empty,
  header,
  className = "",
}: {
  items: T[];
  /** Entries per page (default 1: current season / tournament at a time). */
  pageSize?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  empty?: React.ReactNode;
  header?: React.ReactNode;
  className?: string;
}) {
  const sorted = useMemo(() => [...items], [items]);
  const ps = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(sorted.length / ps));
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [sorted.length]);
  const showArrows = pageCount > 1;
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * ps;
  const slice = sorted.slice(start, start + ps);

  if (sorted.length === 0) {
    return (
      <div className={className}>
        {header}
        {empty ?? null}
      </div>
    );
  }

  return (
    <div className={className}>
      {header}
      <div className={`flex min-h-0 items-stretch gap-1 sm:gap-2 ${header ? "mt-4" : ""}`}>
        {showArrows ?
          <button
            type="button"
            aria-label="Newer"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="inline-flex h-9 w-9 shrink-0 self-center rounded-full border border-slate-200/90 bg-white text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft className="m-auto h-4 w-4" />
          </button>
        : null}
        <ul className="min-w-0 flex-1 space-y-3">
          {slice.map((item, i) => (
            <li key={start + i}>{renderItem(item, start + i)}</li>
          ))}
        </ul>
        {showArrows ?
          <button
            type="button"
            aria-label="Older"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            className="inline-flex h-9 w-9 shrink-0 self-center rounded-full border border-slate-200/90 bg-white text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRight className="m-auto h-4 w-4" />
          </button>
        : null}
      </div>
      {showArrows && pageCount > 1 ?
        <p className="mt-2 text-center text-[0.65rem] font-medium text-slate-400">
          {safePage + 1} / {pageCount}
        </p>
      : null}
    </div>
  );
}
