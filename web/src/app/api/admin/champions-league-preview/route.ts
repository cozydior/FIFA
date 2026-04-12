import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSimPreviewTestMode } from "@/lib/appSettings";
import {
  fakeCompleteClGroupStage,
  fakeCompleteClFinal,
  fakeCompleteClSemis,
  insertClFinalFromSemis,
  insertClKnockoutsFromGroupTables,
} from "@/lib/championsLeaguePreview";

export async function POST(req: Request) {
  try {
    const allowed = await getSimPreviewTestMode();
    if (!allowed) {
      return NextResponse.json(
        { error: "Enable Sim preview test mode in Admin → Season." },
        { status: 403 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      seasonLabel?: string;
      action?: string;
    };
    const supabase = getSupabaseAdmin();

    let seasonLabel = body.seasonLabel?.trim();
    if (!seasonLabel) {
      const { data: s } = await supabase
        .from("seasons")
        .select("label")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      seasonLabel = s?.label?.trim() ?? "";
    }
    if (!seasonLabel) {
      return NextResponse.json({ error: "seasonLabel required or create a season first." }, { status: 400 });
    }

    const action = body.action?.trim();
    switch (action) {
      case "fake_groups": {
        const out = await fakeCompleteClGroupStage(supabase, seasonLabel);
        return NextResponse.json({ ok: true, seasonLabel, ...out });
      }
      case "seed_knockouts": {
        const out = await insertClKnockoutsFromGroupTables(supabase, seasonLabel);
        return NextResponse.json({ ok: true, seasonLabel, ...out });
      }
      case "fake_semis": {
        const out = await fakeCompleteClSemis(supabase, seasonLabel);
        return NextResponse.json({ ok: true, seasonLabel, ...out });
      }
      case "insert_final": {
        const out = await insertClFinalFromSemis(supabase, seasonLabel);
        return NextResponse.json({ ok: true, seasonLabel, ...out });
      }
      case "fake_final": {
        const out = await fakeCompleteClFinal(supabase, seasonLabel);
        return NextResponse.json({ ok: true, seasonLabel, ...out });
      }
      default:
        return NextResponse.json(
          {
            error:
              "action must be fake_groups | seed_knockouts | fake_semis | insert_final | fake_final",
          },
          { status: 400 },
        );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
