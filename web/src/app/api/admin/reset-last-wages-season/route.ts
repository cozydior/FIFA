import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Clears `last_wages_season` on every team so "Apply wages" can run again for the current season label.
 */
export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    const { count, error: countErr } = await supabase
      .from("teams")
      .select("id", { count: "exact", head: true });
    if (countErr) throw new Error(countErr.message);

    const { error: upErr } = await supabase
      .from("teams")
      .update({ last_wages_season: null })
      .not("id", "is", null);
    if (upErr) throw new Error(upErr.message);

    return NextResponse.json({ ok: true, teamCount: count ?? 0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
