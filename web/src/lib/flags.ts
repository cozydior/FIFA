/** Matches `countries.flag_emoji` seed for ENG (Federation ranking & national-team cards). */
export const FLAG_EMOJI_ENGLAND = "🏴";

export function countryCodeToFlagEmoji(code?: string | null): string {
  const v = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(v)) return "🏳️";
  if (v === "ENG") return FLAG_EMOJI_ENGLAND;
  const two = v.length === 3 ? v.slice(0, 2) : v;
  return String.fromCodePoint(...[...two].map((c) => 127397 + c.charCodeAt(0)));
}

export function countryNameToFlagEmoji(country?: string | null): string {
  const key = (country ?? "").trim().toLowerCase();
  if (key === "england") return FLAG_EMOJI_ENGLAND;
  const map: Record<string, string> = {
    spain: "ES",
    france: "FR",
  };
  return countryCodeToFlagEmoji(map[key] ?? "");
}
