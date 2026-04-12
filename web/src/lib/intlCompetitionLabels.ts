const LABELS: Record<string, string> = {
  nations_league: "UEFA Nations League",
  gold_cup: "FIFA Gold Cup",
  world_cup: "FIFA World Cup",
  champions_league: "UEFA Champions League",
};

/** Title case for unknown slugs (underscores → spaces). */
export function formatInternationalCompetitionLabel(slug: string): string {
  const k = slug.trim();
  if (LABELS[k]) return LABELS[k];
  return k
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
