import type { SupabaseClient } from "@supabase/supabase-js";

/** Resolve `countries.flag_emoji` by exact `players.nationality` name match. */
export async function flagEmojiByNationalityNames(
  supabase: SupabaseClient,
  nationalities: string[],
): Promise<Map<string, string>> {
  const uniq = [...new Set(nationalities.map((n) => n.trim()).filter(Boolean))];
  if (uniq.length === 0) return new Map();
  const { data } = await supabase.from("countries").select("name, flag_emoji").in("name", uniq);
  const m = new Map<string, string>();
  for (const r of data ?? []) {
    const fe = r.flag_emoji;
    if (typeof fe === "string" && fe.trim()) m.set(r.name, fe.trim());
  }
  return m;
}
