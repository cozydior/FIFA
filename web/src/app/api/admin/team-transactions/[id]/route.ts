import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

const TRANSFER_LIKE = new Set(["transfer_in", "transfer_out"]);

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { counterparty_team_id?: string | null };
    if (!("counterparty_team_id" in body)) {
      return NextResponse.json(
        { error: "counterparty_team_id is required (use null to clear)" },
        { status: 400 },
      );
    }

    const raw = body.counterparty_team_id;
    const counterparty_team_id =
      raw === null || raw === "" ? null
      : typeof raw === "string" && raw.trim() ? raw.trim()
      : null;

    const supabase = getSupabaseAdmin();
    const { data: row, error: fe } = await supabase
      .from("team_transactions")
      .select("id, category")
      .eq("id", id)
      .maybeSingle();
    if (fe) throw new Error(fe.message);
    if (!row) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    if (!TRANSFER_LIKE.has(row.category)) {
      return NextResponse.json(
        { error: "Only transfer_in / transfer_out rows can set counterparty" },
        { status: 400 },
      );
    }

    if (counterparty_team_id) {
      const { data: team, error: te } = await supabase
        .from("teams")
        .select("id")
        .eq("id", counterparty_team_id)
        .maybeSingle();
      if (te) throw new Error(te.message);
      if (!team) {
        return NextResponse.json({ error: "Unknown counterparty team id" }, { status: 400 });
      }
    }

    const { error: ue } = await supabase
      .from("team_transactions")
      .update({ counterparty_team_id })
      .eq("id", id);
    if (ue) throw new Error(ue.message);

    return NextResponse.json({ ok: true, id, counterparty_team_id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
