import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSimPreviewTestMode } from "@/lib/appSettings";
import { bootstrapInternationalForSlug } from "@/lib/international";
import { fakeCompleteInternationalByStage } from "@/lib/internationalPreview";

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
      slug?: "nations_league" | "gold_cup" | "world_cup";
      action?: "bootstrap" | "fake_stage";
      stage?: "group" | "SF" | "F";
    };

    const seasonLabel = body.seasonLabel?.trim();
    if (!seasonLabel) {
      return NextResponse.json({ error: "seasonLabel is required" }, { status: 400 });
    }
    const slug = body.slug;
    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (body.action === "bootstrap") {
      const result = await bootstrapInternationalForSlug(supabase, seasonLabel, slug);
      return NextResponse.json({ ok: true, seasonLabel, slug, ...result });
    }

    if (body.action === "fake_stage") {
      const stage = body.stage;
      if (!stage) {
        return NextResponse.json({ error: "stage is required (group | SF | F)" }, { status: 400 });
      }
      const out = await fakeCompleteInternationalByStage(supabase, seasonLabel, slug, stage);
      return NextResponse.json({ ok: true, seasonLabel, slug, stage, ...out });
    }

    return NextResponse.json({ error: "action must be bootstrap or fake_stage" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
