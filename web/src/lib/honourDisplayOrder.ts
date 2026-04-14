import type {
  TrophyCabinetEntry,
  TrophyDefinitionRow,
  TrophySeasonDetail,
} from "@/lib/trophyCabinet";
import { resolveTrophyDisplay } from "@/lib/trophyCabinet";
import { cabinetScopeToSortKey } from "@/lib/trophyCabinetScope";

export type GroupedCabinet = {
  entry: TrophyCabinetEntry;
  seasons: TrophySeasonDetail[];
};

/** D1 vs D2 from league / club / trophy label text (demo leagues). */
export function leagueTierFromHonourContext(context: string | undefined): 1 | 2 {
  const s = (context ?? "").toLowerCase();
  if (
    /championship|segunda|ligue 2|second tier|division 2|\bd2\b/.test(s) &&
    !/premier|la liga|ligue 1/.test(s)
  ) {
    return 2;
  }
  return 1;
}

/** @deprecated Use leagueTierFromHonourContext — kept for call sites that only have won_with. */
export function leagueTierFromWonWith(wonWith: string | undefined): 1 | 2 {
  return leagueTierFromHonourContext(wonWith);
}

/**
 * England → Spain → France → other, from won_with plus trophy label (e.g. "Premier League" when won_with is only a club).
 */
export function inferRegionOrderFromContext(context: string | undefined): number {
  const s = (context ?? "").toLowerCase();
  if (/premier|championship|england|\befl\b|wembley|fa cup|efl/.test(s)) return 0;
  if (/la liga|segunda|spain|copa del rey/.test(s)) return 1;
  if (/ligue|france|coupe de france/.test(s)) return 2;
  // Rows often only store a club name + generic "Domestic league title" — infer region from well-known clubs.
  if (
    /\b(manchester|liverpool|chelsea|arsenal|tottenham|everton|newcastle|leeds|leicester|fulham|brighton|bournemouth|burnley|wolves|brentford|ipswich|southampton|west ham|crystal palace|aston villa|sheffield|nottingham|watford|norwich|reading|stoke|swansea|cardiff|huddersfield|blackburn|wigan|bolton|middlesbrough|sunderland)\b/.test(
      s,
    )
  )
    return 0;
  if (
    /\b(real madrid|barcelona|atletico|atlético|sevilla|valencia|villarreal|athletic|sociedad|betis|girona|celta|osasuna|mallorca|getafe|alav[eé]s|rayo|espanyol|granada|las palmas|legan[eé]s|eibar|valladolid)\b/.test(
      s,
    )
  )
    return 1;
  if (
    /\b(lyon|marseille|monaco|lille|rennes|toulouse|nice|strasbourg|nantes|lens|reims|montpellier|bordeaux|angers|metz|le havre|brest|dijon|n[iî]mes|saint-[ée]tienne|toulon|guingamp|lorient|clermont|auxerre)\b/.test(
      s,
    )
  )
    return 2;
  return 3;
}

/** @deprecated Use inferRegionOrderFromContext */
export function inferRegionOrder(wonWith: string | undefined): number {
  return inferRegionOrderFromContext(wonWith);
}

/**
 * Legacy rows often omit trophy_slug; tie-break was label A–Z so "Coupe de France"
 * sorted before "Ligue 1". Infer league vs cup from free text when slug is empty.
 */
function inferLeagueCupKindForSort(blob: string): "league" | "cup" | null {
  const s = blob.toLowerCase();
  if (
    /\bcoupe de france\b|\bcopa del rey\b|\bfa cup\b|\bcarabao\b|\befl cup\b|\bcoupe de la ligue\b|\bleague cup\b|\btroph[eé]e des champions\b|\bsupercopa\b/.test(
      s,
    )
  ) {
    return "cup";
  }
  if (
    /\bligue\s*1\b|\bligue\s*2\b|\bpremier league\b|\bla liga\b|\bsegunda\b|\bchampionship\b|\bleague one\b|\bundesliga\b|\bserie a\b|\beredivisie\b/.test(
      s,
    )
  ) {
    return "league";
  }
  return null;
}

function honourClubCompetitionSortKeyRaw(
  entry: TrophyCabinetEntry,
  defMap: Map<string, TrophyDefinitionRow>,
): number | null {
  const slug = entry.trophy_slug?.trim() ?? "";
  const def = slug ? defMap.get(slug) : undefined;
  const fromScope = cabinetScopeToSortKey(def?.cabinet_scope);
  if (fromScope !== null) return fromScope;

  const label = resolveTrophyDisplay(entry, defMap).label;
  const blob = `${(entry.name ?? "").trim()} ${(entry.won_with ?? "").trim()} ${label}`.trim();
  if (slug === "champions_league") return 0;

  let domKind: "league" | "cup" | null = null;
  if (slug === "domestic_league") domKind = "league";
  else if (slug === "domestic_cup") domKind = "cup";
  else if (!slug) domKind = inferLeagueCupKindForSort(blob);

  if (domKind) {
    const region = inferRegionOrderFromContext(blob);
    const base = 10 + region * 100;
    if (domKind === "league") {
      const tier = leagueTierFromHonourContext(blob);
      return base + (tier === 1 ? 0 : 20);
    }
    return base + 10;
  }
  return null;
}

/** CL → per country D1 → regional cup → D2; unknown club rows default to 800. */
export function honourClubCompetitionSortKey(
  entry: TrophyCabinetEntry,
  defMap: Map<string, TrophyDefinitionRow>,
): number {
  return honourClubCompetitionSortKeyRaw(entry, defMap) ?? 800;
}

function sortKeyTeam(entry: TrophyCabinetEntry, defMap: Map<string, TrophyDefinitionRow>): number {
  return honourClubCompetitionSortKeyRaw(entry, defMap) ?? 500;
}

function sortKeyCountry(entry: TrophyCabinetEntry): number {
  const slug = entry.trophy_slug?.trim() ?? "";
  if (slug === "world_cup") return 0;
  if (slug === "nations_league") return 10;
  if (slug === "gold_cup") return 11;
  return 500;
}

/** Player club row: CL, then per region (England, Spain, France) D1 → regional cup → D2. */
function sortKeyPlayerClub(
  entry: TrophyCabinetEntry,
  defMap: Map<string, TrophyDefinitionRow>,
): number {
  return honourClubCompetitionSortKeyRaw(entry, defMap) ?? 800;
}

function sortKeyPersonal(entry: TrophyCabinetEntry): number {
  const slug = entry.trophy_slug?.trim() ?? "";
  if (slug === "ballon_dor") return 0;
  if (slug === "palm_dor") return 1;
  return 99;
}

export type CabinetSortMode =
  | "team"
  | "country"
  | "player_club"
  | "player_intl"
  | "player_personal";

export function sortCabinetGroups(
  groups: GroupedCabinet[],
  mode: CabinetSortMode,
  defMap: Map<string, TrophyDefinitionRow>,
): GroupedCabinet[] {
  return [...groups].sort((a, b) => {
    let ka: number;
    let kb: number;
    if (mode === "player_club") {
      ka = sortKeyPlayerClub(a.entry, defMap);
      kb = sortKeyPlayerClub(b.entry, defMap);
    } else if (mode === "team") {
      ka = sortKeyTeam(a.entry, defMap);
      kb = sortKeyTeam(b.entry, defMap);
    } else if (mode === "country" || mode === "player_intl") {
      ka = sortKeyCountry(a.entry);
      kb = sortKeyCountry(b.entry);
    } else {
      ka = sortKeyPersonal(a.entry);
      kb = sortKeyPersonal(b.entry);
    }
    if (ka !== kb) return ka - kb;
    return resolveTrophyDisplay(a.entry, defMap).label.localeCompare(
      resolveTrophyDisplay(b.entry, defMap).label,
    );
  });
}

export function filterCabinetBySlugs(
  groups: GroupedCabinet[],
  slugs: Set<string>,
): GroupedCabinet[] {
  return groups.filter((g) => {
    const s = g.entry.trophy_slug?.trim();
    return s && slugs.has(s);
  });
}

export function filterCabinetExcludeSlugs(
  groups: GroupedCabinet[],
  slugs: Set<string>,
): GroupedCabinet[] {
  return groups.filter((g) => {
    const s = g.entry.trophy_slug?.trim();
    if (!s) return true;
    return !slugs.has(s);
  });
}

/** Merge duplicate trophy_slug groups (e.g. awards + cabinet Ballon d&apos;Or). */
export function mergeGroupedBySlug(groups: GroupedCabinet[]): GroupedCabinet[] {
  const m = new Map<string, GroupedCabinet>();
  for (const g of groups) {
    const slug = g.entry.trophy_slug?.trim() ?? "";
    if (!slug) continue;
    const ex = m.get(slug);
    if (!ex) {
      m.set(slug, {
        entry: { ...g.entry },
        seasons: [...g.seasons],
      });
      continue;
    }
    const seen = new Set(ex.seasons.map((s) => `${s.season}\t${s.won_with ?? ""}`));
    for (const s of g.seasons) {
      const k = `${s.season}\t${s.won_with ?? ""}`;
      if (!seen.has(k)) {
        ex.seasons.push(s);
        seen.add(k);
      }
    }
  }
  return [...m.values()];
}
