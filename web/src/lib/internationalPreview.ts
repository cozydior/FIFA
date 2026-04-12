import type { SupabaseClient } from "@supabase/supabase-js";
import { progressInternationalCompetition } from "@/lib/international";

function rndScore(): number {
  return Math.floor(Math.random() * 4);
}

async function getCompId(
  supabase: SupabaseClient,
  seasonLabel: string,
  slug: "nations_league" | "gold_cup" | "world_cup",
): Promise<string | null> {
  const { data } = await supabase
    .from("international_competitions")
    .select("id")
    .eq("season_label", seasonLabel)
    .eq("slug", slug)
    .maybeSingle();
  return data?.id ?? null;
}

export async function fakeCompleteInternationalByStage(
  supabase: SupabaseClient,
  seasonLabel: string,
  slug: "nations_league" | "gold_cup" | "world_cup",
  stage: "group" | "SF" | "F",
): Promise<{ completed: number }> {
  const compId = await getCompId(supabase, seasonLabel, slug);
  if (!compId) return { completed: 0 };

  let q = supabase
    .from("international_fixtures")
    .select("id")
    .eq("competition_id", compId)
    .eq("status", "scheduled");
  q = stage === "group" ? q.eq("stage", "group") : q.eq("stage", stage);

  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  let n = 0;
  for (const r of rows ?? []) {
    const hs = rndScore();
    const as = rndScore();
    const { error: u } = await supabase
      .from("international_fixtures")
      .update({ home_score: hs, away_score: as, status: "completed" })
      .eq("id", r.id);
    if (u) throw new Error(u.message);
    n += 1;
  }

  await progressInternationalCompetition(supabase, seasonLabel, slug);
  return { completed: n };
}
