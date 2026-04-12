import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  type LeagueConfig,
  type SeasonMasterRow,
  buildSeasonMasterSchedule,
} from "@/lib/seasonStructure";

export async function buildSeasonMasterFromDatabase(): Promise<{
  schedule: SeasonMasterRow[];
  warnings: string[];
}> {
  const supabase = getSupabaseAdmin();
  const { data: leaguesRaw, error: le } = await supabase
    .from("leagues")
    .select("id, name, country, division")
    .order("country")
    .order("division");

  const { data: teamsRaw, error: te } = await supabase
    .from("teams")
    .select("id, name, league_id")
    .order("name");

  if (le || te) {
    throw new Error(le?.message ?? te?.message ?? "Supabase error");
  }

  const byLeague = new Map<string, { id: string; name: string }[]>();
  for (const t of teamsRaw ?? []) {
    if (!t.league_id) continue;
    if (!byLeague.has(t.league_id)) byLeague.set(t.league_id, []);
    byLeague.get(t.league_id)!.push({ id: t.id, name: t.name ?? undefined });
  }

  const warnings: string[] = [];
  const leagueConfigs: LeagueConfig[] = [];

  for (const L of leaguesRaw ?? []) {
    const teams = byLeague.get(L.id) ?? [];
    if (teams.length !== 4) {
      if (teams.length > 0) {
        warnings.push(
          `${L.name} (${L.country} ${L.division}): need 4 teams for schedule, has ${teams.length}`,
        );
      }
      continue;
    }
    leagueConfigs.push({
      id: L.id,
      name: L.name,
      country: L.country,
      division: L.division as "D1" | "D2",
      teams,
    });
  }

  const schedule =
    leagueConfigs.length > 0 ? buildSeasonMasterSchedule(leagueConfigs) : [];

  return { schedule, warnings };
}
