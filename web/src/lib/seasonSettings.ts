import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

