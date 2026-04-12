import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Teams with current_balance strictly below threshold (default 0 = any debt).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("threshold");
    const threshold =
      raw !== null && raw !== "" ? Number(raw) : 0;
    if (Number.isNaN(threshold)) {
      return NextResponse.json(
        { error: "threshold must be a number" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("teams")
      .select("id, name, current_balance, league_id")
      .lt("current_balance", threshold)
      .order("current_balance", { ascending: true });
    if (error) throw new Error(error.message);

    return NextResponse.json({
      threshold,
      count: data?.length ?? 0,
      teams: data ?? [],
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load insolvency list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
