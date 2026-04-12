import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";

export type RankingsRoleFilter = "ST" | "GK" | "all";
export type RankingsStatScope =
  | "career"
  | "season"
  | "world_cup"
  | "nations_league"
  | "gold_cup"
  | "champions_league_proxy";

export type RankingsSortKey =
  | "market_value"
  | "peak_market_value"
  | "career_goals"
  | "career_saves"
  | "season_goals"
  | "season_saves"
  | "scope_goals"
  | "scope_saves"
  | "avg_rating"
  | "intl_caps"
  | "intl_goals"
  | "intl_saves";

export type RankingsRow = {
  id: string;
  name: string;
  profile_pic_url: string | null;
  role: string;
  nationality: string | null;
  nationality_flag: string | null;
  nationality_code: string | null;
  market_value: number;
  peak_market_value: number;
  market_value_previous: number | null;
  team_id: string | null;
  team_name: string | null;
  team_logo_url: string | null;
  league_name: string | null;
  league_country: string | null;
  career_goals: number;
  career_saves: number;
  season_goals: number;
  season_saves: number;
  season_avg: number | null;
  intl_caps: number;
  intl_goals: number;
  intl_saves: number;
  scope_goals: number;
  scope_saves: number;
  sort_rating: number;
};

function sumIntlBySlug(
  rows: { competition_slug: string; caps: number | null; goals_for_country: number | null; saves_for_country: number | null }[],
  slug: string,
): { caps: number; goals: number; saves: number } {
  const sub = rows.filter((r) => r.competition_slug === slug);
  return {
    caps: sub.reduce((a, r) => a + Number(r.caps ?? 0), 0),
    goals: sub.reduce((a, r) => a + Number(r.goals_for_country ?? 0), 0),
    saves: sub.reduce((a, r) => a + Number(r.saves_for_country ?? 0), 0),
  };
}

export async function fetchRankingsRows(opts: {
  seasonLabel: string;
  roleFilter: RankingsRoleFilter;
  statScope: RankingsStatScope;
  countryFilter: string;
  leagueIdFilter: string;
  freeAgentsOnly: boolean;
  sortKey: RankingsSortKey;
}): Promise<RankingsRow[]> {
  const supabase = getSupabaseAdmin();

  const [{ data: players }, { data: statsRows }, { data: intlRows }, { data: countryRows }] =
    await Promise.all([
      supabase
        .from("players")
        .select(
          "id, name, role, nationality, profile_pic_url, market_value, peak_market_value, market_value_previous, team_id, teams(id, name, logo_url, league_id, leagues(name, country))",
        ),
      supabase.from("stats").select("player_id, season, goals, saves, appearances, average_rating"),
      supabase
        .from("player_international_stats")
        .select("player_id, season_label, competition_slug, caps, goals_for_country, saves_for_country"),
      supabase.from("countries").select("name, flag_emoji, code"),
    ]);

  const flagByNationality = new Map(
    (countryRows ?? []).map((c) => [c.name, (c.flag_emoji as string | null) ?? null]),
  );
  const codeByNationality = new Map(
    (countryRows ?? []).map((c) => [c.name, String(c.code ?? "").toLowerCase()]),
  );

  const byPlayerStats = new Map<
    string,
    { goals: number; saves: number; apps: number; seasons: Set<string> }
  >();
  for (const s of statsRows ?? []) {
    const pid = s.player_id as string;
    if (!byPlayerStats.has(pid))
      byPlayerStats.set(pid, { goals: 0, saves: 0, apps: 0, seasons: new Set() });
    const b = byPlayerStats.get(pid)!;
    b.goals += Number(s.goals ?? 0);
    b.saves += Number(s.saves ?? 0);
    b.apps += Number(s.appearances ?? 0);
    if (s.season) b.seasons.add(s.season);
  }

  const seasonStats = new Map<string, { goals: number; saves: number; avg: number | null }>();
  for (const s of statsRows ?? []) {
    if (s.season !== opts.seasonLabel) continue;
    const pid = s.player_id as string;
    seasonStats.set(pid, {
      goals: Number(s.goals ?? 0),
      saves: Number(s.saves ?? 0),
      avg: s.average_rating == null ? null : Number(s.average_rating),
    });
  }

  const intlByPlayer = new Map<string, typeof intlRows>();
  for (const r of intlRows ?? []) {
    const pid = r.player_id as string;
    if (!intlByPlayer.has(pid)) intlByPlayer.set(pid, []);
    intlByPlayer.get(pid)!.push(r);
  }

  const rows: RankingsRow[] = [];

  for (const p of players ?? []) {
    if (opts.roleFilter !== "all" && p.role !== opts.roleFilter) continue;
    if (opts.freeAgentsOnly && p.team_id) continue;

    const rawTeam = p.teams as
      | {
          id: string;
          name: string;
          logo_url: string | null;
          league_id: string | null;
          leagues: unknown;
        }
      | unknown[]
      | null;
    const team = Array.isArray(rawTeam) ? rawTeam[0] ?? null : rawTeam;
    const teamLogo =
      team && typeof team === "object" && team !== null && "logo_url" in team
        ? ((team as { logo_url: string | null }).logo_url ?? null)
        : null;
    const rawLeague =
      team && typeof team === "object" && team !== null && "leagues" in team
        ? (team as { leagues: unknown }).leagues
        : null;
    const league = Array.isArray(rawLeague) ? rawLeague[0] ?? null : rawLeague;
    const leagueName =
      league && typeof league === "object" && league && "name" in league
        ? String((league as { name: string }).name)
        : null;
    const leagueCountry =
      league && typeof league === "object" && league && "country" in league
        ? String((league as { country: string }).country)
        : null;

    if (
      opts.leagueIdFilter &&
      team &&
      typeof team === "object" &&
      team !== null &&
      "league_id" in team
    ) {
      if ((team as { league_id: string | null }).league_id !== opts.leagueIdFilter) continue;
    }
    if (opts.countryFilter) {
      if (
        (p.nationality ?? "").toLowerCase() !== opts.countryFilter.toLowerCase()
      ) {
        continue;
      }
    }

    const agg = byPlayerStats.get(p.id) ?? { goals: 0, saves: 0, apps: 0, seasons: new Set() };
    const ss = seasonStats.get(p.id) ?? { goals: 0, saves: 0, avg: null };
    const intlList = intlByPlayer.get(p.id) ?? [];

    let intl_caps = 0;
    let intl_goals = 0;
    let intl_saves = 0;
    for (const r of intlList) {
      intl_caps += Number(r.caps ?? 0);
      intl_goals += Number(r.goals_for_country ?? 0);
      intl_saves += Number(r.saves_for_country ?? 0);
    }

    let scope_goals = agg.goals;
    let scope_saves = agg.saves;
    if (opts.statScope === "season") {
      scope_goals = ss.goals;
      scope_saves = ss.saves;
    } else if (opts.statScope === "world_cup") {
      const o = sumIntlBySlug(intlList, "world_cup");
      scope_goals = o.goals;
      scope_saves = o.saves;
    } else if (opts.statScope === "nations_league") {
      const o = sumIntlBySlug(intlList, "nations_league");
      scope_goals = o.goals;
      scope_saves = o.saves;
    } else if (opts.statScope === "gold_cup") {
      const o = sumIntlBySlug(intlList, "gold_cup");
      scope_goals = o.goals;
      scope_saves = o.saves;
    } else if (opts.statScope === "champions_league_proxy") {
      scope_goals = ss.goals;
      scope_saves = ss.saves;
    }

    const sort_rating =
      opts.statScope === "season" || opts.statScope === "champions_league_proxy"
        ? (ss.avg ?? 0)
        : (() => {
            let sum = 0;
            let n = 0;
            for (const r of statsRows ?? []) {
              if (r.player_id !== p.id) continue;
              if (r.average_rating != null) {
                sum += Number(r.average_rating) * Number(r.appearances ?? 0);
                n += Number(r.appearances ?? 0);
              }
            }
            return n > 0 ? sum / n : 0;
          })();

    const nat = p.nationality ?? null;
    rows.push({
      id: p.id,
      name: p.name,
      profile_pic_url: p.profile_pic_url ?? null,
      role: p.role,
      nationality: nat,
      nationality_flag: nat ? flagByNationality.get(nat) ?? null : null,
      nationality_code: nat ? codeByNationality.get(nat) ?? null : null,
      market_value: Number(p.market_value ?? 0),
      peak_market_value: Number(p.peak_market_value ?? 0),
      market_value_previous:
        p.market_value_previous == null ? null : Number(p.market_value_previous),
      team_id: p.team_id,
      team_name:
        team && typeof team === "object" && team !== null && "name" in team
          ? String((team as { name: string }).name)
          : null,
      team_logo_url: teamLogo,
      league_name: leagueName,
      league_country: leagueCountry,
      career_goals: agg.goals,
      career_saves: agg.saves,
      season_goals: ss.goals,
      season_saves: ss.saves,
      season_avg: ss.avg,
      intl_caps,
      intl_goals,
      intl_saves,
      scope_goals,
      scope_saves,
      sort_rating,
    });
  }

  const key = opts.sortKey;
  const dir = 1;
  rows.sort((a, b) => {
    let va = 0;
    let vb = 0;
    switch (key) {
      case "market_value":
        va = a.market_value;
        vb = b.market_value;
        break;
      case "peak_market_value":
        va = a.peak_market_value;
        vb = b.peak_market_value;
        break;
      case "career_goals":
        va = a.career_goals;
        vb = b.career_goals;
        break;
      case "career_saves":
        va = a.career_saves;
        vb = b.career_saves;
        break;
      case "season_goals":
        va = a.season_goals;
        vb = b.season_goals;
        break;
      case "season_saves":
        va = a.season_saves;
        vb = b.season_saves;
        break;
      case "scope_goals":
        va = a.scope_goals;
        vb = b.scope_goals;
        break;
      case "scope_saves":
        va = a.scope_saves;
        vb = b.scope_saves;
        break;
      case "avg_rating":
        va = a.sort_rating;
        vb = b.sort_rating;
        break;
      case "intl_caps":
        va = a.intl_caps;
        vb = b.intl_caps;
        break;
      case "intl_goals":
        va = a.intl_goals;
        vb = b.intl_goals;
        break;
      case "intl_saves":
        va = a.intl_saves;
        vb = b.intl_saves;
        break;
      default:
        va = a.market_value;
        vb = b.market_value;
    }
    if (vb !== va) return (vb - va) * dir;
    return a.name.localeCompare(b.name);
  });

  return rows;
}

export async function resolveRankingsSeason(override?: string | null): Promise<string | null> {
  const t = override?.trim();
  if (t) return t;
  return getCurrentSeasonLabel();
}
