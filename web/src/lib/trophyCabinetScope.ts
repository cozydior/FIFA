/**
 * Per–trophy-definition ordering for club honours (team + player pages).
 * Stored in trophy_definitions.cabinet_scope; "auto" keeps slug + text inference.
 */
export const TROPHY_CABINET_SCOPES = [
  { value: "auto", label: "Auto (infer from name, slug & won with)" },
  { value: "champions_league", label: "Champions League" },
  { value: "eng_league_d1", label: "England — top division (league)" },
  { value: "eng_cup", label: "England — domestic / league cup" },
  { value: "eng_league_d2", label: "England — second tier (league)" },
  { value: "esp_league_d1", label: "Spain — top division (league)" },
  { value: "esp_cup", label: "Spain — domestic cup" },
  { value: "esp_league_d2", label: "Spain — second tier (league)" },
  { value: "fra_league_d1", label: "France — top division (league)" },
  { value: "fra_cup", label: "France — domestic cup" },
  { value: "fra_league_d2", label: "France — second tier (league)" },
  { value: "other_league_d1", label: "Other country — top division (league)" },
  { value: "other_cup", label: "Other country — domestic cup" },
  { value: "other_league_d2", label: "Other country — second tier (league)" },
] as const;

export type TrophyCabinetScopeValue = (typeof TROPHY_CABINET_SCOPES)[number]["value"];

const ALLOWED = new Set<string>(TROPHY_CABINET_SCOPES.map((o) => o.value));

export function normalizeCabinetScope(raw: string | null | undefined): TrophyCabinetScopeValue {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s && ALLOWED.has(s)) return s as TrophyCabinetScopeValue;
  return "auto";
}

/**
 * Numeric key aligned with honourDisplayOrder (CL=0; per region base 10+100r + offset).
 */
export function cabinetScopeToSortKey(scope: string | null | undefined): number | null {
  const s = normalizeCabinetScope(scope ?? undefined);
  if (s === "auto") return null;
  switch (s) {
    case "champions_league":
      return 0;
    case "eng_league_d1":
      return 10;
    case "eng_cup":
      return 20;
    case "eng_league_d2":
      return 30;
    case "esp_league_d1":
      return 110;
    case "esp_cup":
      return 120;
    case "esp_league_d2":
      return 130;
    case "fra_league_d1":
      return 210;
    case "fra_cup":
      return 220;
    case "fra_league_d2":
      return 230;
    case "other_league_d1":
      return 310;
    case "other_cup":
      return 320;
    case "other_league_d2":
      return 330;
  }
}
