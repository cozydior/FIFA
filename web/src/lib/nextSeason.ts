import type { SupabaseClient } from "@supabase/supabase-js";

/** Next season row after `seasonLabel` in `seasons.created_at` order (oldest → newest). */
export async function getNextSeasonLabelAfter(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<string | null> {
  const { data: rows } = await supabase
    .from("seasons")
    .select("label")
    .order("created_at", { ascending: true });
  const labels = (rows ?? []).map((r) => r.label as string);
  const i = labels.indexOf(seasonLabel);
  if (i === -1 || i >= labels.length - 1) return null;
  return labels[i + 1] ?? null;
}
