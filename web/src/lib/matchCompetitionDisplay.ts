import { formatFixtureCalendarLabel } from "@/lib/calendarPhases";
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

/** Cup / CL round label for schedule lines (e.g. Semi-final, Group A). */
export function formatClubFixtureRoundLabel(
  competition: string | null | undefined,
  cup_round: string | null | undefined,
): string | null {
  const c = competition ?? "";
  const r = cup_round?.trim();
  if (!r) return null;
  if (c === "champions_league") {
    if (r === "CL_GA" || r === "CL_GB") return `Group ${r.slice(-1)}`;
    if (r.startsWith("CL_SF")) return "Semi-final";
    if (r === "CL_F") return "Final";
    return r;
  }
  if (c === "regional_cup") {
    if (r === "SF") return "Semi-final";
    if (r === "F") return "Final";
    if (r === "QF") return "Quarter-final";
    if (/^R\d+$/.test(r)) return `Round ${r.slice(1)}`;
    return r;
  }
  return null;
}

/**
 * Second line for saved club match rows — same idea as international `Semi-final · Week 203`.
 * When a cup/CL round exists: `Round label · Week N` (plain week number, like intl fixtures).
 */
export function savedSimFixtureDetailLine(
  competition: string | null | undefined,
  cup_round: string | null | undefined,
  week: number,
): string {
  const kind = clubFixtureWeekKind(competition);
  const weekPart = formatFixtureCalendarLabel(week, kind);
  const roundPart = formatClubFixtureRoundLabel(competition, cup_round);
  if (roundPart) return `${roundPart} · Week ${week}`;
  return weekPart;
}
