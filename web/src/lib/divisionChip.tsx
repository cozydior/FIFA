import type { ReactNode } from "react";

/** Matches dashboard / DB labels like "D1", "D2" — single chip, no duplicated "D". */
export function formatDivisionChipLabel(division: string | null | undefined): string | null {
  if (division == null) return null;
  const d = String(division).trim();
  if (!d) return null;
  return d.toUpperCase();
}

/** Compact tier chip styled like domestic standings context (D1 / D2). */
export function LeagueDivisionChip({
  division,
  className = "",
}: {
  division: string | null | undefined;
  className?: string;
}): ReactNode {
  const label = formatDivisionChipLabel(division);
  if (!label) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border border-slate-200/90 bg-slate-100 px-2 py-0.5 font-mono text-[0.65rem] font-bold uppercase tracking-wide text-slate-800 shadow-sm ${className}`}
      title={`Division ${label}`}
    >
      {label}
    </span>
  );
}
