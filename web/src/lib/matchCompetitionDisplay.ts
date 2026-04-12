import { cupNameForCountry, cupLogoForCountry } from "@/lib/countryCups";

export function clubCompetitionDisplay(
  f: {
    competition: string | null;
    league_id: string | null;
    country: string | null;
    cup_round: string | null;
  },
  leagueById: Map<
    string,
    { name: string; country: string; division: string; logo_url: string | null }
  >,
  flagByCountry: Map<string, string>,
): {
  competitionLabel: string;
  leagueLogoUrl: string | null;
  countryFlagEmoji: string | null;
  useClBrand: boolean;
} {
  if (f.competition === "league" && f.league_id) {
    const L = leagueById.get(f.league_id);
    if (L) {
      return {
        competitionLabel: `${L.name} · ${L.division}`,
        leagueLogoUrl: L.logo_url ?? null,
        countryFlagEmoji: flagByCountry.get(L.country) ?? null,
        useClBrand: false,
      };
    }
  }
  if (f.competition === "regional_cup") {
    const cname = f.country?.trim() ?? "";
    const rnd = f.cup_round?.trim() ? ` · ${f.cup_round}` : "";
    return {
      competitionLabel: `${cupNameForCountry(cname)}${rnd}`,
      leagueLogoUrl: cupLogoForCountry(cname),
      countryFlagEmoji: cname ? (flagByCountry.get(cname) ?? null) : null,
      useClBrand: false,
    };
  }
  if (f.competition === "champions_league") {
    return {
      competitionLabel: "Champions League",
      leagueLogoUrl: null,
      countryFlagEmoji: null,
      useClBrand: true,
    };
  }
  return {
    competitionLabel: "Fixture",
    leagueLogoUrl: null,
    countryFlagEmoji: null,
    useClBrand: false,
  };
}

export function clubFixtureWeekKind(
  competition: string | null | undefined,
): "league" | "regional_cup" | "champions_league" {
  if (competition === "champions_league") return "champions_league";
  if (competition === "regional_cup") return "regional_cup";
  return "league";
}
