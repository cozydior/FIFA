/**
 * Brand marks for competition UI (standings, dashboard, hubs).
 * Separate from trophy_definitions / player honours cabinet.
 */
export const COMPETITION_BRAND_LOGOS: Record<string, string> = {
  champions_league:
    "https://upload.wikimedia.org/wikipedia/en/f/f5/UEFA_Champions_League.svg",
  gold_cup:
    "https://upload.wikimedia.org/wikipedia/commons/b/b5/Concacaf_Gold_Cup_2021.svg",
  nations_league:
    "https://upload.wikimedia.org/wikipedia/en/thumb/8/80/UEFA_Nations_League.svg/960px-UEFA_Nations_League.svg.png",
  world_cup: "https://i.imgur.com/JgMjWfX.png",
};

export function competitionBrandLogo(slug: string): string | undefined {
  return COMPETITION_BRAND_LOGOS[slug];
}

/** Dashboard `sub` query values → slug keys in COMPETITION_BRAND_LOGOS */
export function internationalSubToSlug(
  sub: "nations-league" | "gold-cup" | "world-cup",
): "nations_league" | "gold_cup" | "world_cup" {
  if (sub === "nations-league") return "nations_league";
  if (sub === "gold-cup") return "gold_cup";
  return "world_cup";
}
