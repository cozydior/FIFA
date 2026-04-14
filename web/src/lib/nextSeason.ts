import type { SupabaseClient } from "@supabase/supabase-js";

/** Parses `Season 3` → 3; other labels → null. */
export function parseSeasonIndexFromLabel(label: string): number | null {
  const m = /^Season\s+(\d+)$/i.exec(label.trim());
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Next season label after `seasonLabel`.
 * Prefer numeric order for `Season N` labels so WC qualifiers land in the correct year even when
 * `seasons.created_at` order differs from competition order.
 */
export async function getNextSeasonLabelAfter(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<string | null> {
  const { data: rows } = await supabase
    .from("seasons")
    .select("label")
    .order("created_at", { ascending: true });
  const labels = (rows ?? []).map((r) => r.label as string);
  const cur = seasonLabel.trim();
  const n = parseSeasonIndexFromLabel(cur);
  if (n != null) {
    const byNum = labels.find((l) => parseSeasonIndexFromLabel(l) === n + 1);
    if (byNum) return byNum;
  }
  const i = labels.indexOf(cur);
  if (i === -1 || i >= labels.length - 1) return null;
  return labels[i + 1] ?? null;
}

/**
 * Prior season label before `seasonLabel` (numeric `Season N` when possible, else created_at chain).
 */
export async function getPreviousSeasonLabel(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<string | null> {
  const { data: rows } = await supabase
    .from("seasons")
    .select("label")
    .order("created_at", { ascending: true });
  const labels = (rows ?? []).map((r) => r.label as string);
  const cur = seasonLabel.trim();
  const n = parseSeasonIndexFromLabel(cur);
  if (n != null && n > 1) {
    const byNum = labels.find((l) => parseSeasonIndexFromLabel(l) === n - 1);
    if (byNum) return byNum;
  }
  const i = labels.indexOf(cur);
  if (i <= 0) return null;
  return labels[i - 1] ?? null;
}
