/**
 * Payout constants (£) and helpers for team balance + transaction log.
 */

export const PAYOUTS_GBP = {
  championsLeague: {
    winner:          80_000_000,
    finalist:        40_000_000,
    semiFinalist:    16_000_000,
    quarterFinalist:  6_000_000,
  },
  league: {
    title:           40_000_000,
    d1Placement:     16_000_000,
    d2Placement:      6_000_000,
    promotion:       20_000_000,
  },
  regionalCup: {
    winner:          20_000_000,
    finalist:         8_000_000,
  },
} as const;

export const WAGE_RATE = 0.5;

/** Fee charged when a team picks up a free agent (fraction of player's market value). */
export const FREE_AGENT_PICKUP_RATE = 0.25;

export function squadAnnualWageBill(totalSquadMarketValue: number): number {
  return Math.round(totalSquadMarketValue * WAGE_RATE);
}

/** Minimum MV at OVR 0 before the ramp to the OVR 40 anchor. */
const MV_FLOOR_GBP = 75_000;

/**
 * Piecewise-linear MV curve: linear 0→40 from floor to £250k, then linear between each anchor OVR.
 * Anchors (overall → £): 40→250k, 50→2M, 60→4.5M, 70→8M, 80→17M, 90→30M, 100→50M.
 */
const MV_ANCHOR_OVR: readonly number[] = [40, 50, 60, 70, 80, 90, 100];
const MV_ANCHOR_GBP: readonly number[] = [
  250_000,
  2_000_000,
  4_500_000,
  8_000_000,
  17_000_000,
  30_000_000,
  50_000_000,
];

function mvFromAnchors(ovr: number): number {
  const o = Math.max(0, Math.min(100, ovr));
  if (o <= MV_ANCHOR_OVR[0]) {
    return Math.round(MV_FLOOR_GBP + (MV_ANCHOR_GBP[0] - MV_FLOOR_GBP) * (o / MV_ANCHOR_OVR[0]));
  }
  for (let i = 0; i < MV_ANCHOR_OVR.length - 1; i += 1) {
    const o0 = MV_ANCHOR_OVR[i];
    const o1 = MV_ANCHOR_OVR[i + 1];
    if (o >= o0 && o <= o1) {
      const m0 = MV_ANCHOR_GBP[i];
      const m1 = MV_ANCHOR_GBP[i + 1];
      const t = (o - o0) / (o1 - o0);
      return Math.round(m0 + (m1 - m0) * t);
    }
  }
  return MV_ANCHOR_GBP[MV_ANCHOR_GBP.length - 1];
}

/**
 * Derives a player's market value from their hidden overall rating.
 * Uses the piecewise-linear anchor table in {@link MV_ANCHOR_OVR} / {@link MV_ANCHOR_GBP}.
 * Wages use {@link WAGE_RATE} (50%) of this value.
 */
export function marketValueFromHiddenOvr(ovr: number): number {
  const raw = mvFromAnchors(ovr);
  return Math.max(MV_FLOOR_GBP, raw);
}

export type TransactionCategory =
  | "champions_league"
  | "league"
  | "regional_cup"
  | "promotion"
  | "wages"
  | "transfer_in"
  | "transfer_out"
  | "free_agent_pickup"
  | "release"
  | "match_fee"
  | "other";
