import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** "Season 3" → "Season 4"; other labels get a safe suffix. */
export function nextSeasonLabelAfter(current: string): string {
  const t = current.trim();
  const m = /^Season\s+(\d+)$/i.exec(t);
  if (m) return `Season ${parseInt(m[1], 10) + 1}`;
  return `${t} (next)`;
}

export async function setCurrentSeasonLabel(label: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const v = label.trim();
  if (!v) throw new Error("Season label is empty");
  const { error: a } = await supabase
    .from("app_settings")
    .upsert({ key: "current_season_label", value: v }, { onConflict: "key" });
  if (a) throw new Error(a.message);
  const { error: b } = await supabase.from("seasons").upsert({ label: v }, { onConflict: "label" });
  if (b) throw new Error(b.message);
}

export async function getCurrentSeasonLabel(): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "current_season_label")
      .maybeSingle();
    const v = typeof data?.value === "string" ? data.value.trim() : "";
    if (v) return v;

    const { data: latest } = await supabase
      .from("seasons")
      .select("label")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lbl = typeof latest?.label === "string" ? latest.label.trim() : "";
    return lbl || null;
  } catch {
    return null;
  }
}

