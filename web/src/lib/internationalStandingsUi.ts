/**
 * Group tables (CL + international): top two both use sky (qualification), then zebra.
 */
export function internationalGroupStandingRowClass(posZeroBased: number): string {
  if (posZeroBased === 0 || posZeroBased === 1) {
    return "border-l-[5px] border-sky-600 bg-sky-50";
  }
  return posZeroBased % 2 === 0 ?
      "border-l-[5px] border-slate-200 bg-white"
    : "border-l-[5px] border-slate-200 bg-slate-50/90";
}
