import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  computeInternationalTable,
  fetchInternationalSavesByNationalTeam,
  progressInternationalCompetition,
} from "@/lib/international";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";

type Params = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);
    const seasonParam = searchParams.get("season");
    const seasonLabel =
      seasonParam?.trim() || (await getCurrentSeasonLabel());
    if (!seasonLabel) {
      return NextResponse.json(
        { error: "No season selected. Create/set a current season in Admin." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    if (slug === "nations_league" || slug === "gold_cup" || slug === "world_cup") {
      await progressInternationalCompetition(supabase, seasonLabel, slug);
    }
    const { data: comp } = await supabase
      .from("international_competitions")
      .select("id, slug, name, season_label")
      .eq("season_label", seasonLabel)
      .eq("slug", slug)
      .maybeSingle();
    if (!comp) {
      return NextResponse.json({ seasonLabel, competition: null, table: [], fixtures: [] });
    }

    const [{ data: entries }, { data: fixtures }, { data: nts }] = await Promise.all([
      supabase
        .from("international_entries")
        .select("national_team_id")
        .eq("competition_id", comp.id),
      supabase
        .from("international_fixtures")
        .select(
          "id, week, stage, group_name, status, home_score, away_score, home_national_team_id, away_national_team_id",
        )
        .eq("competition_id", comp.id)
        .order("week"),
      supabase.from("national_teams").select("id, name, flag_emoji"),
    ]);

    const teamIds = (entries ?? []).map((e) => e.national_team_id);
    const groupFixtures = (fixtures ?? []).filter((f) => f.stage === "group");
    const intlSaves = await fetchInternationalSavesByNationalTeam(
      supabase,
      seasonLabel,
      slug,
    );
    const groups = [...new Set(groupFixtures.map((f) => f.group_name).filter(Boolean))] as string[];
    const groupTables = groups.map((g) => {
      const gf = groupFixtures.filter((f) => f.group_name === g);
      const ids = [...new Set(gf.flatMap((f) => [f.home_national_team_id, f.away_national_team_id]))];
      const table = computeInternationalTable(ids, gf as any, { teamSaves: intlSaves });
      return { group: g, table };
    });
    const table =
      groups.length > 0 ?
        []
      : computeInternationalTable(teamIds, fixtures ?? [], { teamSaves: intlSaves });
    const knockoutFixtures = (fixtures ?? []).filter((f) => f.stage !== "group");
    const nameById = new Map((nts ?? []).map((t) => [t.id, t]));
    const enrichedTable = table.map((r) => ({
      ...r,
      name: nameById.get(r.teamId)?.name ?? r.teamId,
      flag: nameById.get(r.teamId)?.flag_emoji ?? "🏳️",
    }));
    const enrichedFixtures = (fixtures ?? []).map((f) => ({
      ...f,
      home: nameById.get(f.home_national_team_id)?.name ?? f.home_national_team_id,
      away: nameById.get(f.away_national_team_id)?.name ?? f.away_national_team_id,
      homeFlag: nameById.get(f.home_national_team_id)?.flag_emoji ?? "🏳️",
      awayFlag: nameById.get(f.away_national_team_id)?.flag_emoji ?? "🏳️",
    }));

    return NextResponse.json({
      seasonLabel,
      competition: comp,
      table: enrichedTable,
      groupTables: groupTables.map((g) => ({
        group: g.group,
        table: g.table.map((r) => ({
          ...r,
          name: nameById.get(r.teamId)?.name ?? r.teamId,
          flag: nameById.get(r.teamId)?.flag_emoji ?? "🏳️",
        })),
      })),
      fixtures: enrichedFixtures,
      knockoutFixtures: knockoutFixtures.map((f) => ({
        ...f,
        home: nameById.get(f.home_national_team_id)?.name ?? f.home_national_team_id,
        away: nameById.get(f.away_national_team_id)?.name ?? f.away_national_team_id,
        homeFlag: nameById.get(f.home_national_team_id)?.flag_emoji ?? "🏳️",
        awayFlag: nameById.get(f.away_national_team_id)?.flag_emoji ?? "🏳️",
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

