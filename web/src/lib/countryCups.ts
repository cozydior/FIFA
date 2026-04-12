/**
 * Per-country domestic cup configuration: name and brand logo URL.
 * Keys are the country names as stored in the `fixtures.country` column (title-case).
 */
export const COUNTRY_CUPS: Record<string, { name: string; logoUrl: string }> = {
  England: {
    name: "FA Cup",
    logoUrl: "https://i.imgur.com/pKkhi1d.png",
  },
  Spain: {
    name: "Copa del Rey",
    logoUrl: "https://i.imgur.com/FpuQkLQ.png",
  },
  France: {
    name: "Coupe de France",
    logoUrl: "https://i.imgur.com/SAIgiCe.png",
  },
};

/** Returns the cup name for a country, falling back to "Cup" if unknown. */
export function cupNameForCountry(country: string): string {
  return COUNTRY_CUPS[country]?.name ?? `${country} Cup`;
}

/** Returns the cup logo URL for a country, or null if none defined. */
export function cupLogoForCountry(country: string): string | null {
  return COUNTRY_CUPS[country]?.logoUrl ?? null;
}
