import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const CHUNK = 50;

/**
 * Sets league stats.team_id from each player's current club.
 * Default: only rows where team_id is null. Pass { "overwrite": true } to replace
 * existing stats.team_id with the player's current team (use with care).
 */
export async function POST(req: Request) {
  try {
    let overwrite = false;
    try {
      const body = (await req.json()) as { overwrite?: boolean };
      overwrite = Boolean(body?.overwrite);
    } catch {
      /* empty body */
    }

    const supabase = getSupabaseAdmin();
    const { data: players, error: pe } = await supabase
      .from("players")
      .select("id, team_id")
      .not("team_id", "is", null);
    if (pe) throw new Error(pe.message);

    let updatedRows = 0;
    const list = players ?? [];
    for (let i = 0; i < list.length; i += CHUNK) {
      const slice = list.slice(i, i + CHUNK);
      const results = await Promise.all(
        slice.map(async (p) => {
          let q = supabase
            .from("stats")
            .update({ team_id: p.team_id as string })
            .eq("player_id", p.id as string);
          if (!overwrite) q = q.is("team_id", null);
          const { data, error } = await q.select("id");
          if (error) throw new Error(error.message);
          return (data ?? []).length;
        }),
      );
      updatedRows += results.reduce((a, b) => a + b, 0);
    }

    return NextResponse.json({
      ok: true,
      updatedRows,
      playersWithClub: list.length,
      overwrite,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Backfill failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
