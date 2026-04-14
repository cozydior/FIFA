import type { ShotEvent } from "@/lib/simEngine";

export type DbPlayerRow = {
  id: string;
  name: string;
  nationality: string;
  role: string;
  rating: number;
  hidden_ovr?: number | null;
  profile_pic_url: string | null;
  team_id: string | null;
};

function simOvr(p: DbPlayerRow): number {
  return p.hidden_ovr ?? p.rating;
}

export function pickClubLineup(players: DbPlayerRow[]): {
  lineup: DbPlayerRow[];
  error?: string;
} {
  const sts = players
    .filter((p) => p.role === "ST")
    .sort((a, b) => simOvr(b) - simOvr(a))
    .slice(0, 2);
  const gks = players
    .filter((p) => p.role === "GK")
    .sort((a, b) => simOvr(b) - simOvr(a))
    .slice(0, 1);
  if (sts.length < 2) {
    return { lineup: [], error: "Need at least 2 ST players on the team." };
  }
  if (gks.length < 1) {
    return { lineup: [], error: "Need at least 1 GK on the team." };
  }
  return { lineup: [...sts, ...gks] };
}

export type ScoreSplit = {
  regH: number;
  regA: number;
  etH: number;
  etA: number;
};

export function splitFixtureScore(
  homeScore: number,
  awayScore: number,
  scoreDetail: unknown,
): ScoreSplit {
  const d = scoreDetail as
    | {
        regulationHome?: number;
        regulationAway?: number;
        finalHome?: number;
        finalAway?: number;
      }
    | null
    | undefined;
  if (
    d &&
    typeof d.regulationHome === "number" &&
    typeof d.regulationAway === "number" &&
    Number.isFinite(d.regulationHome) &&
    Number.isFinite(d.regulationAway)
  ) {
    const fh = typeof d.finalHome === "number" ? d.finalHome : homeScore;
    const fa = typeof d.finalAway === "number" ? d.finalAway : awayScore;
    return {
      regH: d.regulationHome,
      regA: d.regulationAway,
      etH: Math.max(0, fh - d.regulationHome),
      etA: Math.max(0, fa - d.regulationAway),
    };
  }
  return { regH: homeScore, regA: awayScore, etH: 0, etA: 0 };
}

function strikerIds(sts: [DbPlayerRow, DbPlayerRow]): [string, string] {
  return [sts[0]!.id, sts[1]!.id];
}

function stRating(sts: [DbPlayerRow, DbPlayerRow], strikerId: string): number {
  const row = sts.find((s) => s.id === strikerId);
  return simOvr(row ?? sts[0]!);
}

function makeShot(args: {
  attackingTeamId: string;
  defendingTeamId: string;
  strikerId: string;
  goalkeeperId: string;
  strikerRating: number;
  goalkeeperRating: number;
  goal: boolean;
}): ShotEvent {
  const total = Math.max(1, args.strikerRating + args.goalkeeperRating);
  const roll = args.goal ? 1 : total;
  return {
    attackingTeamId: args.attackingTeamId,
    defendingTeamId: args.defendingTeamId,
    strikerId: args.strikerId,
    goalkeeperId: args.goalkeeperId,
    strikerRatingAtShot: args.strikerRating,
    goalkeeperRatingAtShot: args.goalkeeperRating,
    roll,
    total,
    goal: args.goal,
  };
}

/** Earliest attacking slots first; misses rotate between the two STs. */
function pushRegulationVolley(
  shots: ShotEvent[],
  homeTeamId: string,
  awayTeamId: string,
  homeSts: [DbPlayerRow, DbPlayerRow],
  awaySts: [DbPlayerRow, DbPlayerRow],
  homeGk: DbPlayerRow,
  awayGk: DbPlayerRow,
  regH: number,
  regA: number,
  homeScorers: string[],
  awayScorers: string[],
): void {
  const [h1, h2] = strikerIds(homeSts);
  const [a1, a2] = strikerIds(awaySts);
  let hi = 0;
  let ai = 0;
  let missRot = 0;

  for (let i = 0; i < 4; i++) {
    const needHomeGoal = i < regH;
    const needAwayGoal = i < regA;

    {
      const strikerId =
        needHomeGoal ? (homeScorers[hi++] ?? h1) : [h1, h2][missRot++ % 2]!;
      const goal = needHomeGoal;
      shots.push(
        makeShot({
          attackingTeamId: homeTeamId,
          defendingTeamId: awayTeamId,
          strikerId,
          goalkeeperId: awayGk.id,
          strikerRating: stRating(homeSts, strikerId),
          goalkeeperRating: simOvr(awayGk),
          goal,
        }),
      );
    }

    {
      const strikerId =
        needAwayGoal ? (awayScorers[ai++] ?? a1) : [a1, a2][missRot++ % 2]!;
      const goal = needAwayGoal;
      shots.push(
        makeShot({
          attackingTeamId: awayTeamId,
          defendingTeamId: homeTeamId,
          strikerId,
          goalkeeperId: homeGk.id,
          strikerRating: stRating(awaySts, strikerId),
          goalkeeperRating: simOvr(homeGk),
          goal,
        }),
      );
    }
  }
}

function pushEtPeriods(
  shots: ShotEvent[],
  homeTeamId: string,
  awayTeamId: string,
  homeSts: [DbPlayerRow, DbPlayerRow],
  awaySts: [DbPlayerRow, DbPlayerRow],
  homeGk: DbPlayerRow,
  awayGk: DbPlayerRow,
  etH: number,
  etA: number,
  homeScorersEt: string[],
  awayScorersEt: string[],
): void {
  let hi = 0;
  let ai = 0;
  let missRot = 0;
  const [h1, h2] = strikerIds(homeSts);
  const [a1, a2] = strikerIds(awaySts);

  let hLeft = etH;
  let aLeft = etA;

  while (hLeft > 0 || aLeft > 0) {
    for (let r = 0; r < 2; r++) {
      {
        const goal = hLeft > 0;
        const strikerId =
          goal ? (homeScorersEt[hi++] ?? h1) : [h1, h2][missRot++ % 2]!;
        shots.push(
          makeShot({
            attackingTeamId: homeTeamId,
            defendingTeamId: awayTeamId,
            strikerId,
            goalkeeperId: awayGk.id,
            strikerRating: stRating(homeSts, strikerId),
            goalkeeperRating: simOvr(awayGk),
            goal,
          }),
        );
        if (goal) hLeft--;
      }
      {
        const goal = aLeft > 0;
        const strikerId =
          goal ? (awayScorersEt[ai++] ?? a1) : [a1, a2][missRot++ % 2]!;
        shots.push(
          makeShot({
            attackingTeamId: awayTeamId,
            defendingTeamId: homeTeamId,
            strikerId,
            goalkeeperId: homeGk.id,
            strikerRating: stRating(awaySts, strikerId),
            goalkeeperRating: simOvr(homeGk),
            goal,
          }),
        );
        if (goal) aLeft--;
      }
    }
  }
}

/**
 * Fabricates a plausible shot log for a saved replay. Regulation is always 8 shots when ET=0;
 * otherwise regulation uses `regH`/`regA`, then extra-time rounds (4 shots per period).
 */
export function buildSyntheticShots(args: {
  homeTeamId: string;
  awayTeamId: string;
  homeLineup: DbPlayerRow[];
  awayLineup: DbPlayerRow[];
  split: ScoreSplit;
  /** Home scorers in order (only home goals), length = regH+etH */
  homeScorerIds: string[];
  /** Away scorers in order, length = regA+etA */
  awayScorerIds: string[];
}): ShotEvent[] {
  const { homeTeamId, awayTeamId, split } = args;
  const homeSts = args.homeLineup.filter((p) => p.role === "ST").slice(0, 2) as [
    DbPlayerRow,
    DbPlayerRow,
  ];
  const awaySts = args.awayLineup.filter((p) => p.role === "ST").slice(0, 2) as [
    DbPlayerRow,
    DbPlayerRow,
  ];
  const homeGk = args.homeLineup.find((p) => p.role === "GK");
  const awayGk = args.awayLineup.find((p) => p.role === "GK");
  if (!homeGk || !awayGk || homeSts.length < 2 || awaySts.length < 2) {
    throw new Error("Lineups must include 2× ST and 1× GK per team.");
  }

  const totalH = split.regH + split.etH;
  const totalA = split.regA + split.etA;
  if (args.homeScorerIds.length !== totalH || args.awayScorerIds.length !== totalA) {
    throw new Error(
      `Expected ${totalH} home scorer id(s) and ${totalA} away scorer id(s).`,
    );
  }

  const homeReg = args.homeScorerIds.slice(0, split.regH);
  const awayReg = args.awayScorerIds.slice(0, split.regA);
  const homeEt = args.homeScorerIds.slice(split.regH);
  const awayEt = args.awayScorerIds.slice(split.regA);

  if (split.regH > 4 || split.regA > 4) {
    throw new Error(
      "Regulation cannot have more than 4 goals per side in this sim — check fixture score_detail.",
    );
  }

  const shots: ShotEvent[] = [];

  pushRegulationVolley(
    shots,
    homeTeamId,
    awayTeamId,
    homeSts,
    awaySts,
    homeGk,
    awayGk,
    split.regH,
    split.regA,
    homeReg,
    awayReg,
  );

  if (split.etH > 0 || split.etA > 0) {
    pushEtPeriods(
      shots,
      homeTeamId,
      awayTeamId,
      homeSts,
      awaySts,
      homeGk,
      awayGk,
      split.etH,
      split.etA,
      homeEt,
      awayEt,
    );
  }

  if (shots.length === 0) {
    throw new Error("No shots generated.");
  }

  return shots;
}
