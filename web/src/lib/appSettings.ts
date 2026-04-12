import { getSupabaseAdmin } from "@/lib/supabase/admin";

const KEY = "sim_preview_test_mode";
const KEY_TOURNAMENTS_MODE = "tournaments_mode";

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

function parseBoolSetting(v: unknown): boolean {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s === "true" || s === "1" || s === "yes";
}

/** When on, dashboard shows CL seed / refresh semis and APIs allow those actions. */
export async function getTournamentsMode(): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", KEY_TOURNAMENTS_MODE)
      .maybeSingle();
    return parseBoolSetting(data?.value);
  } catch {
    return false;
  }
}

export async function setTournamentsMode(enabled: boolean): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("app_settings").upsert(
    { key: KEY_TOURNAMENTS_MODE, value: enabled ? "true" : "false" },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
}
