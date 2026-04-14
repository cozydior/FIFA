import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("teams")
      .select(
        "id, name, country, logo_url, league_id, budget, current_balance, trophies",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    const supabase = getSupabaseAdmin();

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.country === "string" && body.country.trim()) {
      updates.country = body.country.trim();
    }
    if (body.logo_url === null || typeof body.logo_url === "string") {
      updates.logo_url =
        typeof body.logo_url === "string" && body.logo_url.trim()
          ? body.logo_url.trim()
          : null;
    }
    if (typeof body.league_id === "string") updates.league_id = body.league_id;
    if (body.league_id === null || body.league_id === "") updates.league_id = null;
    const budgetFromBody =
      typeof body.budget === "number" && !Number.isNaN(body.budget);
    if (budgetFromBody) {
      updates.budget = body.budget;
    }
    if (
      typeof body.current_balance === "number" &&
      !Number.isNaN(body.current_balance)
    ) {
      const newBalance = body.current_balance;
      updates.current_balance = newBalance;
      /**
       * `budget` is the ledger “opening” anchor: invariant is `current_balance = budget + Σ(tx)`.
       * Wages/prizes only touch `current_balance` + transactions. If you edit cash here without
       * sending `budget`, re-derive the anchor so the balance checker stays meaningful.
       */
      if (!budgetFromBody) {
        const { data: txRows, error: txe } = await supabase
          .from("team_transactions")
          .select("amount")
          .eq("team_id", id);
        if (txe) throw new Error(txe.message);
        const sumTx = (txRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
        updates.budget = newBalance - sumTx;
      }
    }
    if (body.trophies !== undefined) {
      if (!Array.isArray(body.trophies)) {
        return NextResponse.json(
          { error: "trophies must be an array" },
          { status: 400 },
        );
      }
      updates.trophies = body.trophies;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("teams")
      .update(updates)
      .eq("id", id)
      .select(
        "id, name, country, logo_url, league_id, budget, current_balance, trophies",
      )
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update team";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
