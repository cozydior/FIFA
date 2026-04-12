/**
 * Champions League structure: 6 qualifiers → 2 groups of 3 (single round-robin) → 4-team KO (SF, F).
 * Pairing / advancement for sim layer can consume this graph.
 */

import { fisherYatesShuffle } from "@/lib/shuffle";

export interface ClGroupFixture {
  group: "A" | "B";
  homeTeamId: string;
  awayTeamId: string;
  matchday: number;
}

export interface ClKnockoutSlot {
  round: "SF" | "F";
  slot: number;
  homeFrom?: string;
  awayFrom?: string;
  label: string;
}

export interface ChampionsLeagueSchedule {
  qualifierIds: string[];
  groupA: string[];
  groupB: string[];
  groupStageFixtures: ClGroupFixture[];
  knockout: ClKnockoutSlot[];
}

/** Single round-robin for 3 teams = 3 matches */
function roundRobinThree(teamIds: string[], group: "A" | "B"): ClGroupFixture[] {
  const [a, b, c] = teamIds;
  return [
    { group, homeTeamId: a, awayTeamId: b, matchday: 1 },
    { group, homeTeamId: b, awayTeamId: c, matchday: 2 },
    { group, homeTeamId: c, awayTeamId: a, matchday: 3 },
  ];
}

/**
 * Top 2 from each group advance (4 teams). Labels reference group standings TBD after group stage.
 */
export function buildChampionsLeagueSchedule(
  qualifierTeamIds: string[],
  randomShuffle: (ids: string[]) => string[] = (ids) => fisherYatesShuffle([...ids]),
): ChampionsLeagueSchedule {
  if (qualifierTeamIds.length !== 6) {
    throw new Error("Champions League expects exactly 6 qualifiers (top 2 × 3 countries).");
  }
  const drawn = randomShuffle([...qualifierTeamIds]);
  const groupA = drawn.slice(0, 3);
  const groupB = drawn.slice(3, 6);

  const groupStageFixtures = [
    ...roundRobinThree(groupA, "A"),
    ...roundRobinThree(groupB, "B"),
  ];

  const knockout: ClKnockoutSlot[] = [
    {
      round: "SF",
      slot: 1,
      label: "SF1 — Group A 1st vs Group B 2nd",
    },
    {
      round: "SF",
      slot: 2,
      label: "SF2 — Group B 1st vs Group A 2nd",
    },
    {
      round: "F",
      slot: 1,
      label: "Final — SF1 winner vs SF2 winner",
    },
  ];

  return {
    qualifierIds: qualifierTeamIds,
    groupA,
    groupB,
    groupStageFixtures,
    knockout,
  };
}
