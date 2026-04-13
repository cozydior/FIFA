/** Colored pill around budget (balance vs squad MV), not the numeral color itself. */
export function budgetVsSquadBubbleClass(balance: number, squadMarketValue: number): string {
  if (squadMarketValue <= 0) {
    return "inline-flex justify-end rounded-full border border-slate-200/90 bg-slate-100/90 px-2.5 py-1 ring-1 ring-slate-200/60";
  }
  const ratio = balance / squadMarketValue;
  if (ratio >= 1) {
    return "inline-flex justify-end rounded-full border border-emerald-200/90 bg-emerald-50 px-2.5 py-1 ring-1 ring-emerald-100/80";
  }
  if (ratio >= 0.5) {
    return "inline-flex justify-end rounded-full border border-amber-200/90 bg-amber-50 px-2.5 py-1 ring-1 ring-amber-100/80";
  }
  return "inline-flex justify-end rounded-full border border-red-200/90 bg-red-50 px-2.5 py-1 ring-1 ring-red-100/80";
}
