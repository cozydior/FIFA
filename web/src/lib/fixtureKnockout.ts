/**
 * Whether a club fixture should use knockout extra-time rules in the sim engine.
 */
export function isClubKnockoutSim(competition: string | null, cupRound: string | null): boolean {
  if (competition === "league") return false;
  if (!cupRound) return false;
  const r = String(cupRound);
  if (competition === "champions_league" && r.startsWith("CL_G")) return false;
  return true;
}
