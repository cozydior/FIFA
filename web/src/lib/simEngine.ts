/**
 * Lightweight match simulator: 2 ST + 1 GK per side, alternating shots (home then away each round),
 * rating updates + FotMob-style scores.
 */

export type SimRole = "ST" | "GK";

export interface SimPlayer {
  id: string;
  rating: number;
  role: SimRole;
  name?: string;
}

/** Exactly two strikers (ST1, ST2) and one goalkeeper. */
export interface SimTeam {
  id: string;
  name?: string;
  strikers: readonly [SimPlayer, SimPlayer];
  goalkeeper: SimPlayer;
}

export interface ShotEvent {
  attackingTeamId: string;
  defendingTeamId: string;
  strikerId: string;
  goalkeeperId: string;
  strikerRatingAtShot: number;
  goalkeeperRatingAtShot: number;
  roll: number;
  total: number;
  goal: boolean;
}

export interface PlayerMatchResult {
  id: string;
  role: SimRole;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  /** FotMob-style performance (0.0–10.0) for this match */
  fotMob: number;
  goals?: number;
  shots?: number;
  saves?: number;
  shotsFaced?: number;
  conceded?: number;
}

/** Regulation = first 8 shots; extra time = further 4-shot periods until a winner (or sudden death). */
export type ScoreBreakdown = {
  regulationHome: number;
  regulationAway: number;
  finalHome: number;
  finalAway: number;
  etPeriodsPlayed: number;
  suddenDeath: boolean;
  displayLine: string;
};

export interface MatchSimulationResult {
  shots: ShotEvent[];
  /** Goals while this team was attacking */
  goalsByTeamId: Record<string, number>;
  players: PlayerMatchResult[];
  /** Knockout-only: regulation vs extra-time line, e.g. `1-1 AET (2-1)` */
  scoreBreakdown?: ScoreBreakdown;
}

export const REGULATION_SHOTS = 8;
export const ET_SHOTS_PER_PERIOD = 4;
export const MAX_ET_PERIODS = 20;
export const MAX_SUDDEN_DEATH_SHOTS = 60;

const RATING_MIN = 0;
const RATING_MAX = 100;

function clampRating(n: number): number {
  return Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(n)));
}

function randomRollInclusive(max: number): number {
  if (max < 1) return 1;
  return Math.floor(Math.random() * max) + 1;
}

/**
 * Goal if roll <= strikerRating, where roll ∈ [1, strikerRating + goalkeeperRating].
 */
export function isGoalFromRoll(
  strikerRating: number,
  goalkeeperRating: number,
  roll: number,
): boolean {
  const s = Math.max(0, strikerRating);
  const g = Math.max(0, goalkeeperRating);
  const total = Math.max(1, s + g);
  const r = Math.min(Math.max(1, roll), total);
  return r <= s;
}

/**
 * Magnitude scales with rating gap; extra weight when the result is “upset”
 * (e.g. 80 ST misses vs 40 GK, or 40 ST scores vs 80 GK).
 */
function ratingDeltaMagnitude(
  strikerRating: number,
  goalkeeperRating: number,
  goal: boolean,
): number {
  const gap = Math.abs(strikerRating - goalkeeperRating);
  const baseScale = 1 + (gap / 100) * 1.5;
  const stFavored = strikerRating > goalkeeperRating;
  let upset = 1;
  if (goal && !stFavored) upset = 1 + gap / 160;
  if (!goal && stFavored) upset = 1 + gap / 160;
  return Math.max(0.25, baseScale * upset);
}

/** Triangular-ish noise in [-1, 1] */
function noise11(): number {
  return (Math.random() + Math.random() - Math.random() - Math.random()) / 2;
}

function fotMobStriker(goals: number, shots: number): number {
  if (shots <= 0) {
    const mid = 5.5 + noise11() * 1.2;
    return clampFotMob(mid);
  }
  const rate = goals / shots;
  const center = 2.8 + rate * 6.8;
  const weightedJitter = noise11() * 1.8 + (Math.random() - 0.5) * 0.9;
  return clampFotMob(center + weightedJitter);
}

function fotMobGoalkeeper(saves: number, faced: number): number {
  if (faced <= 0) {
    const mid = 6 + noise11() * 1;
    return clampFotMob(mid);
  }
  const rate = saves / faced;
  const center = 3 + rate * 6.5;
  const weightedJitter = noise11() * 1.8 + (Math.random() - 0.5) * 0.9;
  return clampFotMob(center + weightedJitter);
}

function clampFotMob(n: number): number {
  const x = Math.round(n * 10) / 10;
  return Math.max(0, Math.min(10, x));
}

function assertTeamShape(team: SimTeam, label: string): void {
  if (!team.strikers || team.strikers.length !== 2) {
    throw new Error(`${label}: need exactly 2 strikers`);
  }
  if (!team.goalkeeper || team.goalkeeper.role !== "GK") {
    throw new Error(`${label}: goalkeeper must have role GK`);
  }
  for (const st of team.strikers) {
    if (st.role !== "ST") {
      throw new Error(`${label}: both strikers must have role ST`);
    }
  }
}

/**
 * Strikers are ordered best-first (setup). Shot index pattern (8 total):
 * H ST1, A ST1, H ST2, A ST2, H ST1, A ST1, H ST2, A ST2 — alternating teams each shot,
 * cycling strikers each pair so both #1s shoot before both #2s.
 */
export function strikerIndexForShot(shotIndex: number): 0 | 1 {
  return (Math.floor(shotIndex / 2) % 2) as 0 | 1;
}

/** Serializable match state for step-by-step / live UI (8 shots total). */
export interface LiveMatchState {
  home: SimTeam;
  away: SimTeam;
  byId: Record<string, SimPlayer>;
  stats: Record<
    string,
    {
      goals: number;
      shots: number;
      saves: number;
      faced: number;
      conceded: number;
    }
  >;
  goalsByTeamId: Record<string, number>;
  /** Shots completed; 8 = end of regulation; grows for knockout extra time / sudden death */
  shotIndex: number;
  shotsLog: ShotEvent[];
  initialRatings: Record<string, number>;
  /** When true, tied knockout ties play extra 4-shot periods then sudden death */
  knockout: boolean;
  /** Snapshot after 8 shots (for score line) */
  regulationScore?: { home: number; away: number };
  /** After max extra-time periods, single-shot resolution until a winner */
  suddenDeath: boolean;
}

export function initLiveMatch(
  home: SimTeam,
  away: SimTeam,
  opts?: { knockout?: boolean },
): LiveMatchState {
  assertTeamShape(home, "home");
  assertTeamShape(away, "away");

  const byId: Record<string, SimPlayer> = {};
  for (const p of [
    ...home.strikers,
    home.goalkeeper,
    ...away.strikers,
    away.goalkeeper,
  ]) {
    byId[p.id] = { ...p, rating: clampRating(p.rating) };
  }

  const stats: LiveMatchState["stats"] = {};
  const initialRatings: Record<string, number> = {};
  for (const id of Object.keys(byId)) {
    stats[id] = {
      goals: 0,
      shots: 0,
      saves: 0,
      faced: 0,
      conceded: 0,
    };
    initialRatings[id] = byId[id].rating;
  }

  return {
    home,
    away,
    byId,
    stats,
    goalsByTeamId: { [home.id]: 0, [away.id]: 0 },
    shotIndex: 0,
    shotsLog: [],
    initialRatings,
    knockout: Boolean(opts?.knockout),
    suddenDeath: false,
  };
}

const ET_TOTAL_SHOTS = ET_SHOTS_PER_PERIOD * MAX_ET_PERIODS;
const SUDDEN_DEATH_START_SHOT_INDEX = REGULATION_SHOTS + ET_TOTAL_SHOTS;

function goalsPair(state: LiveMatchState): { gh: number; ga: number } {
  return {
    gh: state.goalsByTeamId[state.home.id] ?? 0,
    ga: state.goalsByTeamId[state.away.id] ?? 0,
  };
}

/** Enter sudden death after full extra time if still level. */
function maybeEnterSuddenDeath(state: LiveMatchState): LiveMatchState {
  if (!state.knockout || state.suddenDeath) return state;
  if (state.shotIndex !== SUDDEN_DEATH_START_SHOT_INDEX) return state;
  const { gh, ga } = goalsPair(state);
  if (gh !== ga) return state;
  return { ...state, suddenDeath: true };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Deterministic golden goal if sudden death exhausts without a winner.
 */
function forceGoldenGoalShot(state: LiveMatchState): {
  nextState: LiveMatchState;
  shot: ShotEvent;
} {
  const { gh, ga } = goalsPair(state);
  if (gh !== ga) {
    throw new Error("forceGoldenGoalShot called with unequal scores");
  }
  const winHome = hashStr(`${state.home.id}|${state.away.id}|${state.shotIndex}`) % 2 === 0;
  const attack = winHome ? state.home : state.away;
  const defend = winHome ? state.away : state.home;
  const strikerIdx = strikerIndexForShot(state.shotIndex);
  const stPlayer = attack.strikers[strikerIdx];
  const gk = defend.goalkeeper;
  const byId = { ...state.byId };
  const striker = { ...byId[stPlayer.id] };
  const keeper = { ...byId[gk.id] };
  const sR = striker.rating;
  const gR = keeper.rating;
  const stats = { ...state.stats };
  const stStat = { ...stats[striker.id] };
  const gkStat = { ...stats[keeper.id] };
  stStat.shots += 1;
  gkStat.faced += 1;
  const mag = ratingDeltaMagnitude(sR, gR, true);
  striker.rating = clampRating(striker.rating + mag);
  keeper.rating = clampRating(keeper.rating - mag);
  stStat.goals += 1;
  gkStat.conceded += 1;
  const goalsByTeamId = { ...state.goalsByTeamId };
  goalsByTeamId[attack.id] = (goalsByTeamId[attack.id] ?? 0) + 1;
  byId[striker.id] = striker;
  byId[keeper.id] = keeper;
  stats[striker.id] = stStat;
  stats[keeper.id] = gkStat;
  const total = Math.max(1, sR + gR);
  const shot: ShotEvent = {
    attackingTeamId: attack.id,
    defendingTeamId: defend.id,
    strikerId: striker.id,
    goalkeeperId: keeper.id,
    strikerRatingAtShot: sR,
    goalkeeperRatingAtShot: gR,
    roll: 1,
    total,
    goal: true,
  };
  const nextState: LiveMatchState = {
    ...state,
    byId,
    stats,
    goalsByTeamId,
    shotIndex: state.shotIndex + 1,
    shotsLog: [...state.shotsLog, shot],
  };
  return { nextState, shot };
}

export function buildScoreBreakdown(state: LiveMatchState): ScoreBreakdown | undefined {
  if (!state.knockout) return undefined;
  const reg = state.regulationScore;
  if (!reg) return undefined;
  const fh = state.goalsByTeamId[state.home.id] ?? 0;
  const fa = state.goalsByTeamId[state.away.id] ?? 0;
  let etPeriods = 0;
  if (state.shotIndex > REGULATION_SHOTS) {
    const capped = Math.min(state.shotIndex, SUDDEN_DEATH_START_SHOT_INDEX);
    etPeriods = Math.floor((capped - REGULATION_SHOTS) / ET_SHOTS_PER_PERIOD);
  }
  const playedPastRegulation = state.shotIndex > REGULATION_SHOTS;
  const scoreChangedAfterReg =
    fh !== reg.home || fa !== reg.away || state.suddenDeath;
  const hadEtOrSd = scoreChangedAfterReg || playedPastRegulation;
  let displayLine = `${fh}-${fa}`;
  if (hadEtOrSd) {
    const etLabel =
      etPeriods > 1 ? `${etPeriods} AET` : "AET";
    displayLine = `${reg.home}-${reg.away} ${etLabel} (${fh}-${fa})`;
    if (state.suddenDeath) displayLine = `${displayLine} · SD`;
  }
  return {
    regulationHome: reg.home,
    regulationAway: reg.away,
    finalHome: fh,
    finalAway: fa,
    etPeriodsPlayed: etPeriods,
    suddenDeath: state.suddenDeath,
    displayLine,
  };
}

export function isLiveMatchComplete(state: LiveMatchState): boolean {
  if (state.shotIndex < REGULATION_SHOTS) return false;

  const { gh, ga } = goalsPair(state);

  if (!state.knockout) {
    return state.shotIndex >= REGULATION_SHOTS;
  }

  if (state.suddenDeath) {
    return gh !== ga;
  }

  if (state.shotIndex === REGULATION_SHOTS) {
    return gh !== ga;
  }

  const extraShots = state.shotIndex - REGULATION_SHOTS;
  if (extraShots % ET_SHOTS_PER_PERIOD !== 0) return false;
  if (gh !== ga) return true;

  const etPeriodsDone = extraShots / ET_SHOTS_PER_PERIOD;
  if (etPeriodsDone >= MAX_ET_PERIODS) return false;
  return false;
}

/** One shot (home and away alternate; striker slot from strikerIndexForShot). */
export function stepLiveMatchShot(state: LiveMatchState): {
  nextState: LiveMatchState;
  shot: ShotEvent;
} {
  if (isLiveMatchComplete(state)) {
    throw new Error("Match already finished");
  }

  let work = maybeEnterSuddenDeath(state);
  const { gh, ga } = goalsPair(work);
  const sdCap = SUDDEN_DEATH_START_SHOT_INDEX + MAX_SUDDEN_DEATH_SHOTS;
  if (work.suddenDeath && gh === ga && work.shotIndex >= sdCap) {
    return forceGoldenGoalShot(work);
  }

  const homeAttacks = work.shotIndex % 2 === 0;
  const attack = homeAttacks ? work.home : work.away;
  const defend = homeAttacks ? work.away : work.home;
  const strikerIdx = strikerIndexForShot(work.shotIndex);
  const stPlayer = attack.strikers[strikerIdx];
  const gk = defend.goalkeeper;

  const byId = { ...work.byId };
  const striker = { ...byId[stPlayer.id] };
  const keeper = { ...byId[gk.id] };
  const sR = striker.rating;
  const gR = keeper.rating;
  const total = Math.max(1, sR + gR);
  const roll = randomRollInclusive(total);
  const goal = isGoalFromRoll(sR, gR, roll);
  const mag = ratingDeltaMagnitude(sR, gR, goal);

  const stats = { ...work.stats };
  const stStat = { ...stats[striker.id] };
  const gkStat = { ...stats[keeper.id] };
  stStat.shots += 1;
  gkStat.faced += 1;

  const goalsByTeamId = { ...work.goalsByTeamId };

  if (goal) {
    striker.rating = clampRating(striker.rating + mag);
    keeper.rating = clampRating(keeper.rating - mag);
    stStat.goals += 1;
    gkStat.conceded += 1;
    goalsByTeamId[attack.id] = (goalsByTeamId[attack.id] ?? 0) + 1;
  } else {
    striker.rating = clampRating(striker.rating - mag);
    keeper.rating = clampRating(keeper.rating + mag);
    gkStat.saves += 1;
  }

  byId[striker.id] = striker;
  byId[keeper.id] = keeper;
  stats[striker.id] = stStat;
  stats[keeper.id] = gkStat;

  const shot: ShotEvent = {
    attackingTeamId: attack.id,
    defendingTeamId: defend.id,
    strikerId: striker.id,
    goalkeeperId: keeper.id,
    strikerRatingAtShot: sR,
    goalkeeperRatingAtShot: gR,
    roll,
    total,
    goal,
  };

  const nextShotIndex = work.shotIndex + 1;
  const regulationScore =
    nextShotIndex === REGULATION_SHOTS ?
      {
        home: goalsByTeamId[work.home.id] ?? 0,
        away: goalsByTeamId[work.away.id] ?? 0,
      }
    : work.regulationScore;

  const nextState: LiveMatchState = {
    ...work,
    byId,
    stats,
    goalsByTeamId,
    shotIndex: nextShotIndex,
    shotsLog: [...work.shotsLog, shot],
    regulationScore,
  };

  return { nextState, shot };
}

/** One full turn: home shot then away shot (same round index). */
export function stepLiveMatchRound(state: LiveMatchState): {
  nextState: LiveMatchState;
  shots: ShotEvent[];
} {
  if (isLiveMatchComplete(state)) {
    throw new Error("Match already finished");
  }
  let s = state;
  const shots: ShotEvent[] = [];
  const first = stepLiveMatchShot(s);
  s = first.nextState;
  shots.push(first.shot);
  if (!isLiveMatchComplete(s)) {
    const second = stepLiveMatchShot(s);
    s = second.nextState;
    shots.push(second.shot);
  }
  return { nextState: s, shots };
}

/** Run all remaining shots. */
export function runRemainingLiveShots(state: LiveMatchState): {
  nextState: LiveMatchState;
  shots: ShotEvent[];
} {
  let s = state;
  const shots: ShotEvent[] = [];
  while (!isLiveMatchComplete(s)) {
    const step = stepLiveMatchShot(s);
    s = step.nextState;
    shots.push(step.shot);
  }
  return { nextState: s, shots };
}

/** Build full result with FotMob (call when match is complete). */
export function finalizeLiveMatch(state: LiveMatchState): MatchSimulationResult {
  if (!isLiveMatchComplete(state)) {
    throw new Error("Match not finished");
  }

  const players: PlayerMatchResult[] = [];

  for (const id of Object.keys(state.byId)) {
    const final = state.byId[id];
    const st = state.stats[id];
    const ratingBefore = state.initialRatings[id];
    const ratingAfter = final.rating;
    const role = final.role;

    let fotMob: number;
    if (role === "ST") {
      fotMob = fotMobStriker(st.goals, st.shots);
    } else {
      fotMob = fotMobGoalkeeper(st.saves, st.faced);
    }

    const row: PlayerMatchResult = {
      id,
      role,
      ratingBefore,
      ratingAfter,
      ratingDelta: ratingAfter - ratingBefore,
      fotMob,
    };

    if (role === "ST") {
      row.goals = st.goals;
      row.shots = st.shots;
    } else {
      row.saves = st.saves;
      row.shotsFaced = st.faced;
      row.conceded = st.conceded;
    }

    players.push(row);
  }

  players.sort((a, b) => a.id.localeCompare(b.id));

  const scoreBreakdown = buildScoreBreakdown(state);

  return {
    shots: state.shotsLog,
    goalsByTeamId: state.goalsByTeamId,
    players,
    ...(scoreBreakdown ? { scoreBreakdown } : {}),
  };
}

export function formatShotFeedLine(
  shot: ShotEvent,
  teamName: Record<string, string | undefined>,
  playerName: Record<string, string | undefined>,
): string {
  const st = playerName[shot.strikerId] ?? "Striker";
  const gk = playerName[shot.goalkeeperId] ?? "Keeper";
  const atk = teamName[shot.attackingTeamId] ?? "Attackers";
  if (shot.goal) {
    return `${st} (${atk}) shoots… GOAL!`;
  }
  return `${st} shoots… SAVED by ${gk}!`;
}

/**
 * Full match: regulation is 8 shots (home/away alternate); knockout ties continue in extra periods
 * then sudden death — same rules as the live Matchday engine.
 */
export function runMatch(
  home: SimTeam,
  away: SimTeam,
  opts?: { knockout?: boolean },
): MatchSimulationResult {
  assertTeamShape(home, "home");
  assertTeamShape(away, "away");
  let state = initLiveMatch(home, away, { knockout: opts?.knockout });
  let guard = 0;
  while (!isLiveMatchComplete(state)) {
    state = stepLiveMatchShot(state).nextState;
    guard += 1;
    if (guard > 500) {
      throw new Error("runMatch: exceeded shot limit (internal error)");
    }
  }
  return finalizeLiveMatch(state);
}
