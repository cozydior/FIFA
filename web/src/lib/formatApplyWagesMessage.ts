/** Shared copy for apply-wages API responses (admin UI). */
export function formatApplyWagesResponseMessage(data: {
  results?: unknown[] | null;
  skippedAlreadyPaid?: number;
  teamCount?: number;
  season?: string;
}): string {
  const n = data.results?.length ?? 0;
  const skip = data.skippedAlreadyPaid ?? 0;
  const tc = data.teamCount ?? 0;
  const se = typeof data.season === "string" ? data.season : "—";
  if (tc === 0) return `No teams found. Season label: ${se}.`;
  if (n === 0 && skip === tc) {
    return `No wages charged: all ${tc} clubs already paid for ${se}. Advance the current season label (or clear teams’ last_wages_season) to run wages again.`;
  }
  if (skip === 0) {
    return `Charged wages for ${n} team(s). Season ${se}.`;
  }
  return `Charged wages for ${n} team(s); ${skip} skipped (already paid for ${se}).`;
}
