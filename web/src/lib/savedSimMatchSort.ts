export type SavedMatchRowChrono = {
  id: string;
  fixture_id: string | null;
  season_label: string;
  created_at: string;
};

export type FixtureChronoMeta = {
  week: number | null;
  season_label?: string | null;
  sort_order?: number | null;
  /** Used so same-week saved sims list cups above league when shown newest-first. */
  competition?: string | null;
};

/**
 * League (0) → regional cup (1) → Champions League (2) within the same week, ascending.
 * With browse order = reverse(chronological), cup ties appear above league ties in the same week.
 */
function savedSimChronoCompetitionRank(competition: string | null | undefined): number {
  const c = competition ?? "league";
  if (c === "league") return 0;
  if (c === "regional_cup") return 1;
  if (c === "champions_league") return 2;
  return 3;
}

/**
 * Oldest calendar match first (season → week → competition class → sort_order → created_at).
 * Rows without a linked fixture sort after dated ones, by `created_at`.
 */
export function sortSavedSimMatchesAsc<T extends SavedMatchRowChrono>(
  rows: T[],
  fixtureById: Map<string, FixtureChronoMeta>,
): T[] {
  return [...rows].sort((a, b) => {
    const fa = a.fixture_id ? fixtureById.get(a.fixture_id) : undefined;
    const fb = b.fixture_id ? fixtureById.get(b.fixture_id) : undefined;
    const sa = String(fa?.season_label ?? a.season_label ?? "");
    const sb = String(fb?.season_label ?? b.season_label ?? "");
    const sec = sa.localeCompare(sb);
    if (sec !== 0) return sec;
    const wa = fa?.week;
    const wb = fb?.week;
    if (wa != null && wb != null && wa !== wb) return wa - wb;
    if (wa != null && wb == null) return -1;
    if (wa == null && wb != null) return 1;
    const ra = savedSimChronoCompetitionRank(fa?.competition);
    const rb = savedSimChronoCompetitionRank(fb?.competition);
    if (ra !== rb) return ra - rb;
    const oa = fa?.sort_order ?? 0;
    const ob = fb?.sort_order ?? 0;
    if (oa !== ob) return oa - ob;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}
