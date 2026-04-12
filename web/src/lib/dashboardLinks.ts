/** Map `leagues.country` (DB name) to dashboard domestic `?sub=` slug. */
export function countryNameToLeagueDashboardSub(country: string): string | null {
  const m: Record<string, string> = {
    England: "england",
    Spain: "spain",
    France: "france",
  };
  return m[country] ?? null;
}

/** Only England, France, and Spain have modeled domestic club pyramids in this sim. */
export function hasDomesticClubFootball(countryName: string): boolean {
  return countryNameToLeagueDashboardSub(countryName) !== null;
}

/** Link to domestic leagues tab when the nation is modeled in the dashboard. */
export function dashboardDomesticLeagueUrl(
  season: string,
  countryName: string,
): string | null {
  const sub = countryNameToLeagueDashboardSub(countryName);
  if (!sub) return null;
  return `/dashboard?season=${encodeURIComponent(season)}&group=leagues&sub=${sub}`;
}
