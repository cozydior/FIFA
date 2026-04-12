import type { SupabaseClient } from "@supabase/supabase-js";
import { PAYOUTS_GBP, marketValueFromHiddenOvr } from "@/lib/economy";
import { recordTeamTransaction } from "@/lib/economyServer";
import {
  computeStandings,
  filterGhostZeroStandings,
  unionRosterAndFixtureTeamIds,
  type FixtureRow,
} from "@/lib/standings";
import type { LeagueMeta, LeagueStandingRow } from "@/lib/seasonStructure";

const PG_UNIQUE = "23505";

/** Returns true if this process claimed the event (insert ok); false if already recorded. */
export async function tryClaimSeasonEconomyEvent(
  supabase: SupabaseClient,
  seasonLabel: string,
  eventKey: string,
): Promise<boolean> {
  const { error } = await supabase.from("season_economy_events").insert({
    season_label: seasonLabel,
    event_key: eventKey,
  });
  if (!error) return true;
  if (error.code === PG_UNIQUE) return false;
  throw new Error(error.message);
}

export async function fetchLeagueStandingsForSeasonEnd(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ standings: LeagueStandingRow[]; leagues: LeagueMeta[] }> {
  const { data: leagueRows, error: le } = await supabase
    .from("leagues")
    .select("id, country, division")
    .in("division", ["D1", "D2"]);
  if (le) throw new Error(le.message);

  const leagues: LeagueMeta[] = (leagueRows ?? []).map((r) => ({
    id: r.id,
    country: r.country,
    division: r.division as "D1" | "D2",
  }));

  const standings: LeagueStandingRow[] = [];

  for (const L of leagues) {
    const { data: teams, error: te } = await supabase
      .from("teams")
      .select("id")
      .eq("league_id", L.id);
    if (te) throw new Error(te.message);
    const rosterTeamIds = (teams ?? []).map((t) => t.id);

    const { data: fixtures, error: fe } = await supabase
      .from("fixtures")
      .select(
        "league_id, home_team_id, away_team_id, home_score, away_score, status",
      )
      .eq("season_label", seasonLabel)
      .eq("competition", "league")
      .eq("league_id", L.id);
    if (fe) throw new Error(fe.message);

    const fx = (fixtures ?? []) as FixtureRow[];
    const teamIds = unionRosterAndFixtureTeamIds(rosterTeamIds, fx);
    if (teamIds.length === 0) continue;
    const rows = filterGhostZeroStandings(computeStandings(teamIds, fx));
    rows.forEach((row, idx) => {
      standings.push({
        teamId: row.teamId,
        position: idx + 1,
        leagueId: L.id,
        country: L.country,
        division: L.division,
      });
    });
  }

  return { standings, leagues };
}

/**
 * Season goalkeeper saves aggregated by club `team_id` (same source as domestic league tables / CL group UI).
 */
export async function fetchClubSeasonSavesByTeamIds(
  supabase: SupabaseClient,
  seasonLabel: string,
  teamIds: string[],
): Promise<Record<string, number>> {
  const ids = [...new Set(teamIds)].filter(Boolean);
  if (ids.length === 0) return {};

  const [{ data: players }, { data: statRows }] = await Promise.all([
    supabase.from("players").select("id, team_id").in("team_id", ids),
    supabase.from("stats").select("player_id, saves").eq("season", seasonLabel),
  ]);

  const teamByPlayer = new Map((players ?? []).map((p) => [p.id, p.team_id]));
  const acc: Record<string, number> = {};
  for (const s of statRows ?? []) {
    const tid = teamByPlayer.get(s.player_id);
    if (!tid || !ids.includes(tid)) continue;
    acc[tid] = (acc[tid] ?? 0) + Number(s.saves ?? 0);
  }
  return acc;
}

/**
 * League table prizes from final standings only (title, D1 placements, D2 placements).
 * D2 1st receives the former “promotion” pool as part of their 1st-place league prize — not tied to
 * running promotion/relegation. Idempotent per season via season_economy_events.
 */
export async function applySeasonLeaguePayouts(
  supabase: SupabaseClient,
  seasonLabel: string,
  standings: LeagueStandingRow[],
  leagueMeta: LeagueMeta[],
): Promise<{ applied: boolean; notes: string[] }> {
  const claimed = await tryClaimSeasonEconomyEvent(
    supabase,
    seasonLabel,
    "league_end_payouts",
  );
  if (!claimed) {
    return { applied: false, notes: ["League end payouts already applied for this season."] };
  }

  const notes: string[] = [];
  const { title, d1Placement, d2Placement, promotion } = PAYOUTS_GBP.league;
  const metaIds = new Set(leagueMeta.map((m) => m.id));

  try {
  for (const m of leagueMeta) {
    const table = standings
      .filter((s) => s.leagueId === m.id)
      .sort((a, b) => a.position - b.position);
    if (table.length === 0) continue;

    if (m.division === "D1") {
      const first = table.find((s) => s.position === 1);
      if (first) {
        await recordTeamTransaction(supabase, {
          teamId: first.teamId,
          seasonLabel,
          amount: title,
          category: "league",
          note: `${m.country} D1 — Champions (${seasonLabel})`,
        });
        notes.push(`D1 title: team ${first.teamId.slice(0, 8)}… +£${title}`);
      }
      for (const s of table) {
        if (s.position >= 2 && s.position <= 4) {
          await recordTeamTransaction(supabase, {
            teamId: s.teamId,
            seasonLabel,
            amount: d1Placement,
            category: "league",
            note: `${m.country} D1 — ${ordinalPlace(s.position)} place`,
          });
        }
      }
    } else if (m.division === "D2") {
      for (const s of table) {
        if (s.position >= 1 && s.position <= 4) {
          const amount =
            s.position === 1 ? d2Placement + promotion : d2Placement;
          await recordTeamTransaction(supabase, {
            teamId: s.teamId,
            seasonLabel,
            amount,
            category: "league",
            note:
              s.position === 1 ?
                `${m.country} D2 — 1st place (league prize pool)`
              : `${m.country} D2 — ${ordinalPlace(s.position)} place`,
          });
          if (s.position === 1) {
            notes.push(
              `D2 1st: team ${s.teamId.slice(0, 8)}… +£${amount} (includes top-half D2 prize)`,
            );
          }
        }
      }
    }
  }

  // Team success tax on player market values
  const championTeamIds = standings
    .filter((s) => s.position === 1 && s.division === "D1")
    .map((s) => s.teamId);
  for (const tid of championTeamIds) {
    await applyTeamSuccessTax(supabase, tid, 0.05);
  }
  const d2FirstTeamIds = standings
    .filter((s) => s.division === "D2" && s.position === 1)
    .map((s) => s.teamId);
  for (const tid of d2FirstTeamIds) {
    await applyTeamSuccessTax(supabase, tid, 0.03);
  }

  const orphan = standings.filter((s) => !metaIds.has(s.leagueId));
  if (orphan.length > 0) {
    notes.push(`Warning: ${orphan.length} standing row(s) reference unknown leagues (skipped extras).`);
  }

  return { applied: true, notes };
  } catch (e) {
    await supabase
      .from("season_economy_events")
      .delete()
      .eq("season_label", seasonLabel)
      .eq("event_key", "league_end_payouts");
    throw e;
  }
}

/** After a regional cup final (single leg). Draw → no prize money. */
export async function tryApplyRegionalCupFinalPayouts(
  supabase: SupabaseClient,
  params: {
    fixtureId: string;
    seasonLabel: string;
    country: string;
    winnerTeamId: string;
    loserTeamId: string;
  },
): Promise<{ paid: boolean; reason?: string }> {
  const key = `regional_cup_final:${params.fixtureId}`;
  const claimed = await tryClaimSeasonEconomyEvent(
    supabase,
    params.seasonLabel,
    key,
  );
  if (!claimed) {
    return { paid: false, reason: "Cup final already paid for this fixture." };
  }
  const { winner, finalist } = PAYOUTS_GBP.regionalCup;
  try {
    await recordTeamTransaction(supabase, {
      teamId: params.winnerTeamId,
      seasonLabel: params.seasonLabel,
      amount: winner,
      category: "regional_cup",
      note: `${params.country} Cup — Winner (${params.seasonLabel})`,
    });
    await recordTeamTransaction(supabase, {
      teamId: params.loserTeamId,
      seasonLabel: params.seasonLabel,
      amount: finalist,
      category: "regional_cup",
      note: `${params.country} Cup — Runner-up (${params.seasonLabel})`,
    });
    return { paid: true };
  } catch (e) {
    await supabase
      .from("season_economy_events")
      .delete()
      .eq("season_label", params.seasonLabel)
      .eq("event_key", key);
    throw e;
  }
}

export async function applyChampionsLeaguePayouts(
  supabase: SupabaseClient,
  seasonLabel: string,
  payload: {
    winnerTeamId: string;
    runnerUpTeamId: string;
    semiLoserTeamIds?: string[];
    quarterFinalistTeamIds?: string[];
  },
): Promise<{ applied: boolean; notes: string[] }> {
  const claimed = await tryClaimSeasonEconomyEvent(
    supabase,
    seasonLabel,
    "cl_knockout_payouts",
  );
  if (!claimed) {
    return {
      applied: false,
      notes: ["Champions League payouts already applied for this season."],
    };
  }

  const notes: string[] = [];
  const cl = PAYOUTS_GBP.championsLeague;

  try {
  await recordTeamTransaction(supabase, {
    teamId: payload.winnerTeamId,
    seasonLabel,
    amount: cl.winner,
    category: "champions_league",
    note: `Champions League — Winner (${seasonLabel})`,
  });
  notes.push(`CL winner +£${cl.winner}`);

  await recordTeamTransaction(supabase, {
    teamId: payload.runnerUpTeamId,
    seasonLabel,
    amount: cl.finalist,
    category: "champions_league",
    note: `Champions League — Runner-up (${seasonLabel})`,
  });
  notes.push(`CL runner-up +£${cl.finalist}`);

  for (const tid of payload.semiLoserTeamIds ?? []) {
    await recordTeamTransaction(supabase, {
      teamId: tid,
      seasonLabel,
      amount: cl.semiFinalist,
      category: "champions_league",
      note: `Champions League — Semi-finalist (${seasonLabel})`,
    });
    notes.push(`CL semi +£${cl.semiFinalist}`);
  }

  for (const tid of payload.quarterFinalistTeamIds ?? []) {
    await recordTeamTransaction(supabase, {
      teamId: tid,
      seasonLabel,
      amount: cl.quarterFinalist,
      category: "champions_league",
      note: `Champions League — Quarter-finalist (${seasonLabel})`,
    });
    notes.push(`CL QF +£${cl.quarterFinalist}`);
  }

  return { applied: true, notes };
  } catch (e) {
    await supabase
      .from("season_economy_events")
      .delete()
      .eq("season_label", seasonLabel)
      .eq("event_key", "cl_knockout_payouts");
    throw e;
  }
}

function ordinalPlace(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

async function applyTeamSuccessTax(
  supabase: SupabaseClient,
  teamId: string,
  pct: number,
): Promise<void> {
  const { data: players } = await supabase
    .from("players")
    .select("id, market_value, peak_market_value")
    .eq("team_id", teamId);
  for (const p of players ?? []) {
    const mv = Number(p.market_value ?? 0);
    const next = Math.max(0, Math.round(mv * (1 + pct)));
    await supabase
      .from("players")
      .update({
        market_value: next,
        market_value_previous: mv,
        peak_market_value: Math.max(Number(p.peak_market_value ?? 0), next),
      })
      .eq("id", p.id);
  }
}

// ---------------------------------------------------------------------------
// End-of-season bundle helpers
// ---------------------------------------------------------------------------

/** Pay all completed regional cup finals for the season that have not yet been paid. */
export async function applyPendingRegionalCupFinalPayouts(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ fixtureId: string; paid: boolean; reason?: string }[]> {
  const { data: rows, error } = await supabase
    .from("fixtures")
    .select("id, home_team_id, away_team_id, home_score, away_score, country, season_label")
    .eq("season_label", seasonLabel)
    .eq("competition", "regional_cup")
    .eq("cup_round", "F")
    .eq("status", "completed");
  if (error) throw new Error(error.message);

  const out: { fixtureId: string; paid: boolean; reason?: string }[] = [];
  for (const fx of rows ?? []) {
    const hs = Number(fx.home_score);
    const as_ = Number(fx.away_score);
    const country = typeof fx.country === "string" ? fx.country.trim() : "";
    if (!country) {
      out.push({ fixtureId: fx.id, paid: false, reason: "Missing country on fixture" });
      continue;
    }
    if (hs === as_) {
      out.push({ fixtureId: fx.id, paid: false, reason: "Draw — no payout" });
      continue;
    }
    const winnerId = hs > as_ ? (fx.home_team_id as string) : (fx.away_team_id as string);
    const loserId = hs > as_ ? (fx.away_team_id as string) : (fx.home_team_id as string);
    const r = await tryApplyRegionalCupFinalPayouts(supabase, {
      fixtureId: fx.id,
      seasonLabel,
      country,
      winnerTeamId: winnerId,
      loserTeamId: loserId,
    });
    out.push({ fixtureId: fx.id, paid: r.paid, reason: r.reason });
  }
  return out;
}

/** Detect CL winner/runner-up and semi losers from completed fixtures, then apply payouts. */
export async function applyChampionsLeaguePayoutsFromFixtures(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ applied: boolean; notes: string[]; skipped?: string }> {
  const { data: finals, error: fe } = await supabase
    .from("fixtures")
    .select("home_team_id, away_team_id, home_score, away_score")
    .eq("season_label", seasonLabel)
    .eq("competition", "champions_league")
    .eq("cup_round", "CL_F")
    .eq("status", "completed")
    .limit(1);
  if (fe) throw new Error(fe.message);
  const finalFx = finals?.[0];
  if (!finalFx) {
    return { applied: false, notes: [], skipped: "No completed CL final (CL_F) for this season." };
  }
  const fh = Number(finalFx.home_score);
  const fa = Number(finalFx.away_score);
  if (fh === fa) {
    return { applied: false, notes: [], skipped: "CL final is a draw — resolve before payouts." };
  }
  const winner = fh > fa ? (finalFx.home_team_id as string) : (finalFx.away_team_id as string);
  const runnerUp = fh > fa ? (finalFx.away_team_id as string) : (finalFx.home_team_id as string);

  const { data: sfs } = await supabase
    .from("fixtures")
    .select("home_team_id, away_team_id, home_score, away_score")
    .eq("season_label", seasonLabel)
    .eq("competition", "champions_league")
    .in("cup_round", ["CL_SF1", "CL_SF2"])
    .eq("status", "completed");
  const semiLosers: string[] = [];
  for (const m of sfs ?? []) {
    const sh = Number(m.home_score);
    const sa = Number(m.away_score);
    if (sh !== sa) {
      semiLosers.push(sh > sa ? (m.away_team_id as string) : (m.home_team_id as string));
    }
  }

  return applyChampionsLeaguePayouts(supabase, seasonLabel, {
    winnerTeamId: winner,
    runnerUpTeamId: runnerUp,
    semiLoserTeamIds: semiLosers,
  });
}

/** Recalculate every player's market value from their hidden OVR and snapshot to history. */
export async function recalculateAllPlayerMarketValues(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ updated: number }> {
  const { data: players, error } = await supabase
    .from("players")
    .select("id, hidden_ovr, peak_market_value");
  if (error) throw new Error(error.message);
  let updated = 0;
  for (const p of players ?? []) {
    const ovr = Number(p.hidden_ovr ?? 0);
    const next = marketValueFromHiddenOvr(ovr);
    const peak = Math.max(Number(p.peak_market_value ?? 0), next);
    const { error: ue } = await supabase
      .from("players")
      .update({ market_value: next, market_value_previous: null, peak_market_value: peak })
      .eq("id", p.id);
    if (ue) throw new Error(ue.message);
    if (seasonLabel) {
      await supabase.from("player_market_value_history").upsert(
        { player_id: p.id, season_label: seasonLabel, market_value: next },
        { onConflict: "player_id,season_label" },
      );
    }
    updated += 1;
  }
  return { updated };
}
