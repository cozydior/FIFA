import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const CONFIRM = "RESET_ALL_SIMULATION_DATA";

const DEFAULT_CLUB_FUNDS = 3_000_000;

/**
 * Destructive: clears match stats, deletes all club and international fixtures, clears tournaments,
 * resets player ratings/MV aggregates, clears transactions and award history, resets club balances.
 * Does not delete leagues, teams, players, or seasons rows.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { confirm?: string };
    if (body.confirm !== CONFIRM) {
      return NextResponse.json(
        {
          error: `Send { "confirm": "${CONFIRM}" } to proceed.`,
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const { error: s1 } = await supabase.from("stats").delete().not("player_id", "is", null);
    if (s1) throw new Error(s1.message);

    const { error: s2 } = await supabase.from("season_player_awards").delete().not("player_id", "is", null);
    if (s2) throw new Error(s2.message);

    const { error: s3 } = await supabase.from("player_international_stats").delete().not("player_id", "is", null);
    if (s3) throw new Error(s3.message);

    const { error: s3b } = await supabase.from("national_team_callups").delete().not("player_id", "is", null);
    if (s3b && !s3b.message.includes("schema cache")) throw new Error(s3b.message);

    const { error: s4 } = await supabase.from("player_market_value_history").delete().not("player_id", "is", null);
    if (s4) throw new Error(s4.message);

    const { error: s5 } = await supabase.from("team_transactions").delete().not("team_id", "is", null);
    if (s5) throw new Error(s5.message);

    const { error: s6 } = await supabase.from("season_economy_events").delete().not("id", "is", null);
    if (s6 && !s6.message.includes("does not exist") && !s6.message.includes("schema cache")) {
      throw new Error(s6.message);
    }

    const { error: ssm } = await supabase.from("saved_sim_matches").delete().not("id", "is", null);
    if (ssm && !ssm.message.includes("does not exist") && !ssm.message.includes("schema cache")) {
      throw new Error(ssm.message);
    }

    const { error: fx } = await supabase.from("fixtures").delete().not("id", "is", null);
    if (fx) throw new Error(fx.message);

    const { error: te } = await supabase.from("tournament_entries").delete().not("id", "is", null);
    if (te && !te.message.includes("does not exist") && !te.message.includes("schema cache")) {
      throw new Error(te.message);
    }

    const { error: tr } = await supabase.from("tournaments").delete().not("id", "is", null);
    if (tr && !tr.message.includes("does not exist") && !tr.message.includes("schema cache")) {
      throw new Error(tr.message);
    }

    const { error: ic } = await supabase.from("international_competitions").delete().not("id", "is", null);
    if (ic && !ic.message.includes("does not exist") && !ic.message.includes("schema cache")) {
      throw new Error(ic.message);
    }

    const { error: pl } = await supabase
      .from("players")
      .update({
        rating: 50,
        hidden_ovr: 50,
        market_value: 0,
        peak_market_value: 0,
        market_value_previous: 0,
        career_salary_earned: 0,
      })
      .not("id", "is", null);
    if (pl) throw new Error(pl.message);

    const { error: tm } = await supabase
      .from("teams")
      .update({
        last_wages_season: null,
        current_balance: DEFAULT_CLUB_FUNDS,
        budget: DEFAULT_CLUB_FUNDS,
      })
      .not("id", "is", null);
    if (tm && !tm.message.includes("last_wages_season") && !tm.message.includes("schema cache")) {
      throw new Error(tm.message);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reset failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
