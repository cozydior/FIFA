/**
 * Group tables: top two advance (Nations League / Gold Cup / World Cup groups).
 * Matches domestic dashboard styling (sky = qualification path).
 */
export function internationalGroupStandingRowClass(posZeroBased: number): string {
  if (posZeroBased < 2) {
    return "border-l-[5px] border-sky-600 bg-sky-50";
  }
  return posZeroBased % 2 === 0 ?
      "border-l-[5px] border-slate-200 bg-white"
    : "border-l-[5px] border-slate-200 bg-slate-50/90";
}
