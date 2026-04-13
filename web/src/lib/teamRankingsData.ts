import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamRankingRow = {
  id: string;
  name: string;
  logo_url: string | null;
  squad_market_value: number;
  current_balance: number;
  league_name: string | null;
  league_country: string | null;
  /** e.g. "D1", "D2" */
  league_division: string | null;
  league_logo_url: string | null;
};

/** All clubs ranked by total roster market value (desc). */
export async function fetchTeamRankingsBySquadValue(
  supabase: SupabaseClient,
): Promise<TeamRankingRow[]> {
  const [{ data: teams }, { data: players }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, logo_url, current_balance, league_id, leagues(name, country, division, logo_url)")
      .order("name"),
    supabase.from("players").select("team_id, market_value"),
  ]);
  const mv = new Map<string, number>();
  for (const t of teams ?? []) mv.set(t.id, 0);
  for (const p of players ?? []) {
    const tid = p.team_id as string | null;
    if (!tid || !mv.has(tid)) continue;
    mv.set(tid, (mv.get(tid) ?? 0) + Number(p.market_value ?? 0));
  }
  const rows: TeamRankingRow[] = (teams ?? []).map((t) => {
    const rawL = t.leagues as
      | { name: string; country: string; division: string; logo_url?: string | null }
      | { name: string; country: string; division: string; logo_url?: string | null }[]
      | null;
    const L = Array.isArray(rawL) ? rawL[0] ?? null : rawL;
    return {
      id: t.id,
      name: t.name,
      logo_url: (t.logo_url as string | null) ?? null,
      squad_market_value: mv.get(t.id) ?? 0,
      current_balance: Number(t.current_balance ?? 0),
      league_name: L?.name ?? null,
      league_country: L?.country ?? null,
      league_division: L?.division ?? null,
      league_logo_url: (L?.logo_url as string | null) ?? null,
    };
  });
  rows.sort((a, b) => {
    if (b.squad_market_value !== a.squad_market_value) {
      return b.squad_market_value - a.squad_market_value;
    }
    return a.name.localeCompare(b.name);
  });
  return rows;
}
