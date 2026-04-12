/**
 * Payout constants (£) and helpers for team balance + transaction log.
 */

export const PAYOUTS_GBP = {
  championsLeague: {
    winner:          40_000_000,
    finalist:        20_000_000,
    semiFinalist:     8_000_000,
    quarterFinalist:  3_000_000,
  },
  league: {
    title:           20_000_000,
    d1Placement:      8_000_000,
    d2Placement:      3_000_000,
    promotion:       10_000_000,
  },
  regionalCup: {
    winner:          10_000_000,
    finalist:         4_000_000,
  },
} as const;

export const WAGE_RATE = 0.5;

/** Fee charged when a team picks up a free agent (fraction of player's market value). */
export const FREE_AGENT_PICKUP_RATE = 0.25;

export function squadAnnualWageBill(totalSquadMarketValue: number): number {
  return Math.round(totalSquadMarketValue * WAGE_RATE);
}

/**
 * Derives a player's market value from their hidden overall rating.
 * Scale: 65 OVR ≈ £3M · 75 OVR ≈ £13M · 85 OVR ≈ £41M · 90 OVR ≈ £66M · 95 OVR ≈ £100M
 */
export function marketValueFromHiddenOvr(ovr: number): number {
  const x = Math.max(0, Math.min(100, ovr));
  return Math.max(100_000, Math.round(150_000_000 * Math.pow(Math.max(0, x - 40) / 60, 4.5)));
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
