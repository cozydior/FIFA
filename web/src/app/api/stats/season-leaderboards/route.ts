import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  fetchSeasonCombinedSavedAndIntlLeaderboards,
  fetchSeasonSavedMatchLeaderboards,
} from "@/lib/seasonLeaderboards";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const season = searchParams.get("season")?.trim();
    if (!season) {
      return NextResponse.json({ error: "season query required" }, { status: 400 });
    }
    const competition = searchParams.get("competition")?.trim() || null;
    const leagueId = searchParams.get("leagueId")?.trim() || null;
    const cupCountry = searchParams.get("cupCountry")?.trim() || null;

    const supabase = getSupabaseAdmin();
    const useCombined = !competition && !leagueId && !cupCountry;
    const { topScorers, topSavers } = useCombined ?
      await fetchSeasonCombinedSavedAndIntlLeaderboards(supabase, {
        seasonLabel: season,
      })
    : await fetchSeasonSavedMatchLeaderboards(supabase, {
        seasonLabel: season,
        competition,
        leagueId,
        cupCountry,
      });

    const ids = [...new Set([...topScorers.map((x) => x.playerId), ...topSavers.map((x) => x.playerId)])];
    const { data: players } =
      ids.length === 0 ?
        { data: [] as { id: string; name: string; role: string | null; profile_pic_url: string | null; team_id: string | null; teams: unknown }[] }
      : await supabase
          .from("players")
          .select("id, name, role, profile_pic_url, team_id, teams(name)")
          .in("id", ids);

    const byId = new Map((players ?? []).map((p) => [p.id, p]));

    const enrich = (rows: { playerId: string; goals?: number; saves?: number }[]) =>
      rows.map((r) => {
        const p = byId.get(r.playerId);
        const teamName =
          p?.teams && typeof p.teams === "object" && p.teams && "name" in p.teams ?
            String((p.teams as { name?: string }).name ?? "")
          : "";
        return {
          ...r,
          name: p?.name ?? r.playerId,
          role: p?.role ?? null,
          profilePic: p?.profile_pic_url ?? null,
          teamName: teamName || null,
        };
      });

    return NextResponse.json({
      season,
      competition,
      leagueId,
      topScorers: enrich(topScorers),
      topSavers: enrich(topSavers.map((x) => ({ playerId: x.playerId, saves: x.saves }))),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
