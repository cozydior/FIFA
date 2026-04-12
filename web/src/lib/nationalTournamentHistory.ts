import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeInternationalTable,
  tiebreakInternationalKnockout,
} from "@/lib/international";

export type NationalTournamentFinish = {
  seasonLabel: string;
  slug: string;
  competitionName: string;
  /** Short label for the badge */
  finish: string;
  /** Longer subtitle */
  detail: string | null;
  kind:
    | "champion"
    | "runner_up"
    | "semis"
    | "final_pending"
    | "qualified"
    | "group_live"
    | "group_out"
    | "inactive";
};

function involvesNt(
  f: {
    home_national_team_id: string;
    away_national_team_id: string;
  },
  ntId: string,
): boolean {
  return f.home_national_team_id === ntId || f.away_national_team_id === ntId;
}

function winnerId(f: {
  id: string;
  home_national_team_id: string;
  away_national_team_id: string;
  home_score: number | null;
  away_score: number | null;
}): string {
  const hs = f.home_score ?? 0;
  const as = f.away_score ?? 0;
  if (hs > as) return f.home_national_team_id;
  if (as > hs) return f.away_national_team_id;
  return tiebreakInternationalKnockout(
    f.home_national_team_id,
    f.away_national_team_id,
    f.id,
  );
}

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

type Fx = {
  id: string;
  stage: string;
  group_name: string | null;
  week: number;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_national_team_id: string;
  away_national_team_id: string;
};

function describeCompetitionFinish(ntId: string, fixtures: Fx[], slug: string): NationalTournamentFinish | null {
  if (fixtures.length === 0) return null;

  const finals = fixtures.filter((f) => f.stage === "F");
  const sf = fixtures.filter((f) => f.stage === "SF");
  const groupFx = fixtures.filter((f) => f.stage === "group");

  const completedFinal = finals.find(
    (f) => f.status === "completed" && f.home_score != null && f.away_score != null,
  );
  if (completedFinal && involvesNt(completedFinal, ntId)) {
    const w = winnerId(completedFinal);
    if (w === ntId) {
      return {
        seasonLabel: "",
        slug,
        competitionName: "",
        finish: "Champion",
        detail: "Won the final",
        kind: "champion",
      };
    }
    return {
      seasonLabel: "",
      slug,
      competitionName: "",
      finish: "Runner-up",
      detail: "Lost in the final",
      kind: "runner_up",
    };
  }

  const mySf = sf.find((f) => involvesNt(f, ntId));
  if (mySf) {
    if (mySf.status !== "completed" || mySf.home_score == null || mySf.away_score == null) {
      return {
        seasonLabel: "",
        slug,
        competitionName: "",
        finish: "Semi-finals",
        detail: "Knockout tie not completed yet",
        kind: "semis",
      };
    }
    const w = winnerId(mySf);
    if (w !== ntId) {
      return {
        seasonLabel: "",
        slug,
        competitionName: "",
        finish: "Semi-finals",
        detail: "Eliminated in the semi-final",
        kind: "semis",
      };
    }
    const pendingFinal = finals.find((f) => involvesNt(f, ntId));
    if (pendingFinal && pendingFinal.status !== "completed") {
      return {
        seasonLabel: "",
        slug,
        competitionName: "",
        finish: "Final",
        detail: "Awaiting the final",
        kind: "final_pending",
      };
    }
  }

  const myGroup = groupFx.filter((f) => involvesNt(f, ntId));
  if (myGroup.length === 0) return null;

  const gname = myGroup[0]?.group_name ?? "?";
  const pool = groupFx.filter((f) => f.group_name === gname);
  const teamIds = [...new Set(pool.flatMap((f) => [f.home_national_team_id, f.away_national_team_id]))];
  const played = pool.filter((f) => f.status === "completed");
  const groupInProgress = pool.some((f) => f.status !== "completed");

  if (played.length === 0) {
    return {
      seasonLabel: "",
      slug,
      competitionName: "",
      finish: "Group stage",
      detail: `Group ${gname} — fixtures not played`,
      kind: "inactive",
    };
  }

  const table = computeInternationalTable(teamIds, played);
  const pos = table.findIndex((r) => r.teamId === ntId);
  const rank = pos >= 0 ? pos + 1 : table.length + 1;

  if (groupInProgress) {
    return {
      seasonLabel: "",
      slug,
      competitionName: "",
      finish: "Group stage",
      detail: `Group ${gname} — ${ordinal(rank)} with games remaining`,
      kind: "group_live",
    };
  }

  if (rank > 2) {
    return {
      seasonLabel: "",
      slug,
      competitionName: "",
      finish: "Eliminated",
      detail: `${ordinal(rank)} in group ${gname} — did not advance`,
      kind: "group_out",
    };
  }

  if (sf.length === 0) {
    return {
      seasonLabel: "",
      slug,
      competitionName: "",
      finish: "Qualified",
      detail: `Top two in group ${gname} — knockouts not drawn yet`,
      kind: "qualified",
    };
  }

  const inSf = sf.some((f) => involvesNt(f, ntId));
  if (!inSf) {
    return {
      seasonLabel: "",
      slug,
      competitionName: "",
      finish: "Eliminated",
      detail: `Finished ${ordinal(rank)} in group ${gname}`,
      kind: "group_out",
    };
  }

  return {
    seasonLabel: "",
    slug,
    competitionName: "",
    finish: "Knockouts",
    detail: "Advanced from the group stage",
    kind: "qualified",
  };
}

/**
 * Per-season, per-tournament finishes for a national team (from international fixtures).
 */
export async function fetchNationalTournamentHistory(
  supabase: SupabaseClient,
  nationalTeamId: string,
): Promise<NationalTournamentFinish[]> {
  const { data: touched } = await supabase
    .from("international_fixtures")
    .select("competition_id")
    .or(
      `home_national_team_id.eq.${nationalTeamId},away_national_team_id.eq.${nationalTeamId}`,
    );

  const compIds = [...new Set((touched ?? []).map((t) => t.competition_id).filter(Boolean))] as string[];
  if (compIds.length === 0) return [];

  const [{ data: comps }, { data: allRows }] = await Promise.all([
    supabase
      .from("international_competitions")
      .select("id, season_label, slug, name")
      .in("id", compIds),
    supabase
      .from("international_fixtures")
      .select(
        "id, competition_id, stage, group_name, week, status, home_score, away_score, home_national_team_id, away_national_team_id",
      )
      .in("competition_id", compIds),
  ]);

  const byComp = new Map<string, Fx[]>();
  for (const r of allRows ?? []) {
    const cid = r.competition_id as string;
    if (!byComp.has(cid)) byComp.set(cid, []);
    const row = r as Fx & { competition_id: string };
    byComp.get(cid)!.push({
      id: row.id,
      stage: row.stage,
      group_name: row.group_name,
      week: row.week,
      status: row.status,
      home_score: row.home_score,
      away_score: row.away_score,
      home_national_team_id: row.home_national_team_id,
      away_national_team_id: row.away_national_team_id,
    });
  }

  const out: NationalTournamentFinish[] = [];

  for (const c of comps ?? []) {
    const all = byComp.get(c.id) ?? [];
    const relevant = all.filter((f) => involvesNt(f, nationalTeamId));
    if (relevant.length === 0) continue;

    const d = describeCompetitionFinish(nationalTeamId, all, c.slug);
    if (!d) continue;

    out.push({
      ...d,
      seasonLabel: c.season_label,
      slug: c.slug,
      competitionName: c.name,
    });
  }

  out.sort((a, b) => {
    const s = b.seasonLabel.localeCompare(a.seasonLabel);
    if (s !== 0) return s;
    return a.slug.localeCompare(b.slug);
  });

  return out;
}
