/**
 * Trophy cabinet entries on teams/players (JSON arrays).
 * Prefer trophy_slug + trophy_definitions for name/icon; legacy rows may use name/icon_url only.
 */
export type TrophyCabinetEntry = {
  trophy_slug?: string;
  name?: string;
  season?: string;
  /** Club name, national team, or country label (e.g. "Arsenal", "England") for this honour row */
  won_with?: string;
  icon_url?: string | null;
};

/** One season line in a grouped cabinet tile (may include who it was won with). */
export type TrophySeasonDetail = {
  season: string;
  won_with?: string;
};

export type TrophyDefinitionRow = {
  id: string;
  slug: string;
  name: string;
  icon_url: string | null;
  sort_order: number;
};

export function definitionsBySlug(
  defs: TrophyDefinitionRow[],
): Map<string, TrophyDefinitionRow> {
  return new Map(defs.map((d) => [d.slug, d]));
}

/** Resolved label + icon for display (entry override wins for icon). */
export function resolveTrophyDisplay(
  entry: TrophyCabinetEntry,
  defs: Map<string, TrophyDefinitionRow>,
): { label: string; iconUrl: string | null } {
  const fromCat = entry.trophy_slug ? defs.get(entry.trophy_slug) : undefined;
  const label =
    (fromCat?.name && entry.trophy_slug ? fromCat.name : null) ??
    (typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : null) ??
    "Trophy";
  const iconUrl =
    (typeof entry.icon_url === "string" && entry.icon_url.trim() ? entry.icon_url.trim() : null) ??
    fromCat?.icon_url ??
    null;
  return { label, iconUrl };
}

export function parseTrophyList(raw: unknown): TrophyCabinetEntry[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as TrophyCabinetEntry[];
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function trophyGroupKey(e: TrophyCabinetEntry, index: number): string {
  const slug = e.trophy_slug?.trim();
  if (slug) return `slug:${slug}`;
  const n = e.name?.trim();
  if (n) return `name:${n.toLowerCase()}`;
  return `anon:${index}`;
}

/** Merge duplicate honours (same trophy won in multiple seasons) into one tile with all seasons listed. */
export function groupTrophyCabinetEntries(
  entries: TrophyCabinetEntry[],
  defs: Map<string, TrophyDefinitionRow>,
): Array<{ entry: TrophyCabinetEntry; seasons: TrophySeasonDetail[] }> {
  const byKey = new Map<
    string,
    {
      entry: TrophyCabinetEntry;
      detailKeys: Set<string>;
      details: TrophySeasonDetail[];
    }
  >();
  entries.forEach((e, index) => {
    const key = trophyGroupKey(e, index);
    const season =
      typeof e.season === "string" && e.season.trim() ? e.season.trim() : "";
    const won_with =
      typeof e.won_with === "string" && e.won_with.trim() ? e.won_with.trim() : undefined;
    if (!season && !won_with) {
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { entry: { ...e }, detailKeys: new Set(), details: [] });
      }
      return;
    }
    const dk = `${season}\t${won_with ?? ""}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        entry: { ...e },
        detailKeys: new Set([dk]),
        details: [{ season: season || "—", won_with }],
      });
    } else {
      if (!existing.detailKeys.has(dk)) {
        existing.detailKeys.add(dk);
        existing.details.push({ season: season || "—", won_with });
      }
    }
  });
  const defOrder = (slug: string | undefined) => {
    if (!slug) return 999;
    return defs.get(slug)?.sort_order ?? 999;
  };
  return [...byKey.values()]
    .map(({ entry, details }) => ({
      entry,
      seasons: [...details].sort((a, b) =>
        a.season.localeCompare(b.season, undefined, { numeric: true }),
      ),
    }))
    .sort((a, b) => {
      const sa = a.entry.trophy_slug;
      const sb = b.entry.trophy_slug;
      const oa = defOrder(sa);
      const ob = defOrder(sb);
      if (oa !== ob) return oa - ob;
      return resolveTrophyDisplay(a.entry, defs).label.localeCompare(
        resolveTrophyDisplay(b.entry, defs).label,
      );
    });
}
