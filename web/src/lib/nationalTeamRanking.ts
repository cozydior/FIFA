/**
 * Federation rating from completed international fixtures (all competitions, all seasons in DB).
 * Wins increase rating; draws help slightly; losses decrease it; knockout stakes add extra win/loss weight.
 */
export type NationalTeamPointsRow = {
  nationalTeamId: string;
  /** Net score — can be negative after bad runs */
  rating: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
};

function winStageBonus(stage: string | null | undefined): number {
  if (stage === "F") return 2;
  if (stage === "SF") return 1;
  return 0;
}

/** Extra pain for losing high-stakes knockouts */
function lossStagePenalty(stage: string | null | undefined): number {
  if (stage === "F") return 2;
  if (stage === "SF") return 1;
  return 0;
}

const BASE_LOSS = 3;

export function computeNationalTeamPointsFromFixtures(
  fixtures: Array<{
    home_national_team_id: string;
    away_national_team_id: string;
    home_score: number | null;
    away_score: number | null;
    stage: string | null;
    status: string;
  }>,
): NationalTeamPointsRow[] {
  const m = new Map<
    string,
    { rating: number; played: number; w: number; d: number; l: number }
  >();
  const ensure = (id: string) => {
    if (!m.has(id)) {
      m.set(id, { rating: 0, played: 0, w: 0, d: 0, l: 0 });
    }
    return m.get(id)!;
  };

  for (const f of fixtures) {
    if (f.status !== "completed" || f.home_score == null || f.away_score == null) {
      continue;
    }
    const hs = f.home_score;
    const as = f.away_score;
    const stage = f.stage ?? "group";
    const h = ensure(f.home_national_team_id);
    const a = ensure(f.away_national_team_id);
    h.played += 1;
    a.played += 1;

    if (hs > as) {
      h.w += 1;
      h.rating += 3 + winStageBonus(stage);
      a.l += 1;
      a.rating -= BASE_LOSS + lossStagePenalty(stage);
    } else if (as > hs) {
      a.w += 1;
      a.rating += 3 + winStageBonus(stage);
      h.l += 1;
      h.rating -= BASE_LOSS + lossStagePenalty(stage);
    } else {
      h.d += 1;
      a.d += 1;
      h.rating += 1;
      a.rating += 1;
    }
  }

  return [...m.entries()].map(([nationalTeamId, r]) => ({
    nationalTeamId,
    rating: r.rating,
    played: r.played,
    won: r.w,
    drawn: r.d,
    lost: r.l,
  }));
}
