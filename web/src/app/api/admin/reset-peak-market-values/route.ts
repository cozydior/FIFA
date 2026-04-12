import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const CHUNK = 40;

/**
 * Sets every player's peak_market_value to their current market_value (null → 0).
 * Use after testing when peaks no longer reflect real career highs.
 */
export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: rows, error: selErr } = await supabase
      .from("players")
      .select("id, market_value");
    if (selErr) throw new Error(selErr.message);
    const list = rows ?? [];
    let updated = 0;
    for (let i = 0; i < list.length; i += CHUNK) {
      const slice = list.slice(i, i + CHUNK);
      const results = await Promise.all(
        slice.map(async (p) => {
          const mv = Number(p.market_value ?? 0);
          const { error } = await supabase
            .from("players")
            .update({ peak_market_value: mv })
            .eq("id", p.id);
          return error;
        }),
      );
      const firstErr = results.find(Boolean);
      if (firstErr) throw new Error(firstErr.message);
      updated += slice.length;
    }
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
