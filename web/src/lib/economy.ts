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

/** £75k floor in the 0–40 linear ramp; 41–100 uses `MV_COEFFICIENT`. */
const MV_FLOOR_GBP = 75_000;
/** Coefficient for 41–100: ROUND(75000 + MV_COEFFICIENT * ((OVR-40)/60)^0.78). */
const MV_COEFFICIENT = 19_925_000;
const MV_POWER = 0.78;

/** Rounds raw £ to the nearest £100,000 (e.g. 19,481,950 → 19,500,000). */
function roundMarketValueToNearest100k(raw: number): number {
  return Math.round(raw / 100_000) * 100_000;
}

/**
 * Raw MV before display rounding: £875k at 40; 41–100 from the power law; 0–39 linear from floor to 40.
 */
function rawMarketValueFromOvr(ovr: number): number {
  const o = Math.max(0, Math.min(100, ovr));
  if (o <= 40) {
    return Math.round(MV_FLOOR_GBP + (875_000 - MV_FLOOR_GBP) * (o / 40));
  }
  const t = (o - 40) / 60;
  return Math.round(MV_FLOOR_GBP + MV_COEFFICIENT * Math.pow(t, MV_POWER));
}

/**
 * Derives a player's market value from their hidden overall rating.
 * Curve: fixed £875,000 at 40; 41–100 = ROUND(75000 + 19925000·((OVR−40)/60)^0.78).
 * 0–39: linear ramp (integer £) with no £100k snap so MV stays below the OVR 40 anchor.
 * 41+: nearest £100,000 (OVR 40 stays £875,000 — snap alone would give £900,000).
 * Wages use {@link WAGE_RATE} (50%) of this value.
 */
export function marketValueFromHiddenOvr(ovr: number): number {
  const o = Math.max(0, Math.min(100, ovr));
  const raw = rawMarketValueFromOvr(o);
  if (o < 40) return Math.max(MV_FLOOR_GBP, raw);
  if (o === 40) return 875_000;
  return Math.max(MV_FLOOR_GBP, roundMarketValueToNearest100k(raw));
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
