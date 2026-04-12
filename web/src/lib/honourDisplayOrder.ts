import type {
  TrophyCabinetEntry,
  TrophyDefinitionRow,
  TrophySeasonDetail,
} from "@/lib/trophyCabinet";
import { resolveTrophyDisplay } from "@/lib/trophyCabinet";

export type GroupedCabinet = {
  entry: TrophyCabinetEntry;
  seasons: TrophySeasonDetail[];
};

/** D1 vs D2 from league name / won_with (demo leagues). */
export function leagueTierFromWonWith(wonWith: string | undefined): 1 | 2 {
  const s = (wonWith ?? "").toLowerCase();
  if (
    /championship|segunda|ligue 2|second tier|division 2|\bd2\b/.test(s) &&
    !/premier|la liga|ligue 1/.test(s)
  ) {
    return 2;
  }
  return 1;
}

/** England → Spain → France → other, inferred from text. */
export function inferRegionOrder(wonWith: string | undefined): number {
  const s = (wonWith ?? "").toLowerCase();
  if (/premier|championship|england|\befl\b/.test(s)) return 0;
  if (/la liga|segunda|spain/.test(s)) return 1;
  if (/ligue|france/.test(s)) return 2;
  return 3;
}

function sortKeyTeam(entry: TrophyCabinetEntry): number {
  const slug = entry.trophy_slug?.trim() ?? "";
  const ww = entry.won_with ?? "";
  if (slug === "champions_league") return 0;
  if (slug === "domestic_cup") return 10;
  if (slug === "domestic_league") return 20 + leagueTierFromWonWith(ww);
  return 500;
}

function sortKeyCountry(entry: TrophyCabinetEntry): number {
  const slug = entry.trophy_slug?.trim() ?? "";
  if (slug === "world_cup") return 0;
  if (slug === "nations_league") return 10;
  if (slug === "gold_cup") return 11;
  return 500;
}

/** Player club row: CL, then by region (England, Spain, France), cup then D1 then D2. */
function sortKeyPlayerClub(entry: TrophyCabinetEntry): number {
  const slug = entry.trophy_slug?.trim() ?? "";
  const ww = entry.won_with ?? "";
  if (slug === "champions_league") return 0;
  const region = inferRegionOrder(ww);
  if (slug === "domestic_cup") return 100 + region * 30 + 0;
  if (slug === "domestic_league") {
    const tier = leagueTierFromWonWith(ww);
    return 100 + region * 30 + tier;
  }
  return 800;
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
  const keyFn =
    mode === "team" ? sortKeyTeam
    : mode === "country" || mode === "player_intl" ? sortKeyCountry
    : mode === "player_club" ? sortKeyPlayerClub
    : sortKeyPersonal;

  return [...groups].sort((a, b) => {
    const ka = keyFn(a.entry);
    const kb = keyFn(b.entry);
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
