import { getSupabaseAdmin } from "@/lib/supabase/admin";

const KEY = "sim_preview_test_mode";

export async function getSimPreviewTestMode(): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("app_settings").select("value").eq("key", KEY).maybeSingle();
    const v = typeof data?.value === "string" ? data.value.trim().toLowerCase() : "";
    return v === "true" || v === "1" || v === "yes";
  } catch {
    return false;
  }
}

export async function setSimPreviewTestMode(enabled: boolean): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("app_settings").upsert(
    { key: KEY, value: enabled ? "true" : "false" },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
}
