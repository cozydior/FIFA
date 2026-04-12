/**
 * Single-elimination tree after QF: QF → SF → F (same calendar weeks as seasonStructure placeholders).
 */

export interface KnockoutLink {
  round: "QF" | "SF" | "F";
  slot: number;
  feedsSlot?: { round: "SF" | "F"; slot: number };
  label: string;
}

/** QF winners feed SF slots 1 and 2; SF winners feed Final */
export const REGIONAL_CUP_KNOCKOUT_LINKS: KnockoutLink[] = [
  { round: "QF", slot: 1, feedsSlot: { round: "SF", slot: 1 }, label: "QF1 → SF1 (home)" },
  { round: "QF", slot: 2, feedsSlot: { round: "SF", slot: 1 }, label: "QF2 → SF1 (away)" },
  { round: "QF", slot: 3, feedsSlot: { round: "SF", slot: 2 }, label: "QF3 → SF2 (home)" },
  { round: "QF", slot: 4, feedsSlot: { round: "SF", slot: 2 }, label: "QF4 → SF2 (away)" },
  { round: "SF", slot: 1, feedsSlot: { round: "F", slot: 1 }, label: "SF1 → Final (home)" },
  { round: "SF", slot: 2, feedsSlot: { round: "F", slot: 1 }, label: "SF2 → Final (away)" },
];
