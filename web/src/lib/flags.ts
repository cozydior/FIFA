export function countryCodeToFlagEmoji(code?: string | null): string {
  const v = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(v)) return "🏳️";
  const two = v.length === 3 ? v.slice(0, 2) : v;
  return String.fromCodePoint(...[...two].map((c) => 127397 + c.charCodeAt(0)));
}

export function countryNameToFlagEmoji(country?: string | null): string {
  const map: Record<string, string> = {
    // England has its own flag emoji sequence; simplest safe fallback is UK.
    // We now prefer countries.flag_emoji from DB when available.
    england: "GB",
    spain: "ES",
    france: "FR",
  };
  const key = (country ?? "").trim().toLowerCase();
  return countryCodeToFlagEmoji(map[key] ?? "");
}
