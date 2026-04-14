/**
 * Calendar ordering: domestic league/cup weeks stay low; Champions League mid; international high.
 * This keeps sorts and “Next up” lists in a sensible order without mixing week-1 league with week-1 intl.
 */
export const CHAMPIONS_LEAGUE_WEEK_MIN = 40;
export const INTERNATIONAL_CALENDAR_WEEK_MIN = 200;
/** World Cup group stage (after regional international calendars). */
export const WORLD_CUP_GROUP_WEEK_START = 240;

/** Display label for fixture lists (dashboard, tournament pages). */
export function formatFixtureCalendarLabel(
  week: number,
  kind:
    | "league"
    | "regional_cup"
    | "champions_league"
    | "international"
    | "world_cup"
    | "friendlies",
): string {
  if (kind === "international") {
    return `Intl W${week}`;
  }
  if (kind === "friendlies") {
    return `Friendly W${week}`;
  }
  if (kind === "world_cup") {
    return `WC W${week}`;
  }
  if (kind === "champions_league") {
    return `CL W${week}`;
  }
  return `Week ${week}`;
}
