import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  applyTeamBalanceDrifts,
  computeTeamBalanceDrifts,
} from "@/lib/teamBalanceReconciliation";

/**
 * Compare each club's `current_balance` to `budget + Σ(team_transactions.amount)`.
 * Here `budget` is the ledger opening anchor (kept in sync when you PATCH `current_balance` via Admin).
 * POST `{ "apply": true }` sets `current_balance` to the expected value for every mismatch.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { apply?: boolean };
    const apply = body.apply === true;
    const supabase = getSupabaseAdmin();
    const mismatches = await computeTeamBalanceDrifts(supabase);

    if (!apply) {
      return NextResponse.json({
        ok: true,
        apply: false,
        mismatchCount: mismatches.length,
        mismatches,
      });
    }

    const fixed = await applyTeamBalanceDrifts(supabase, mismatches);
    const remaining = await computeTeamBalanceDrifts(supabase);

    return NextResponse.json({
      ok: true,
      apply: true,
      fixed,
      remainingCount: remaining.length,
      remaining,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reconcile failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
