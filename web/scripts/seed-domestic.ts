/**
 * Idempotent domestic pyramid seed: ensure 4 teams × 6 leagues (2 ST + 1 GK each),
 * then insert league + regional cup QF fixtures for NEXT_PUBLIC_SEASON_LABEL.
 *
 * Run from /web:  npm run seed:domestic
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  buildSeasonMasterSchedule,
  type LeagueConfig,
} from "../src/lib/seasonStructure";

config({ path: resolve(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const season = process.env.NEXT_PUBLIC_SEASON_LABEL ?? "2026/27";

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FN = [
  "Alex",
  "Jordan",
  "Sam",
  "Chris",
  "Taylor",
  "Morgan",
  "Casey",
  "Riley",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

async function ensureRoster() {
  const { data: leagues, error: le } = await supabase
    .from("leagues")
    .select("id, name, country, division")
    .order("country");
  if (le) throw le;
  console.log(`Leagues in DB: ${leagues?.length ?? 0}`);
  if (!leagues?.length) {
    console.warn(
      "Apply migration 20260410000000_pillar_schema.sql (countries + domestic leagues) first.",
    );
    return;
  }

  for (const L of leagues ?? []) {
    const { data: existing } = await supabase
      .from("teams")
      .select("id")
      .eq("league_id", L.id);

    const have = existing?.length ?? 0;
    for (let i = have; i < 4; i++) {
      const { data: team, error: te } = await supabase
        .from("teams")
        .insert({
          name: `${L.name.replace(/'/g, "")} ${i + 1}`,
          country: L.country,
          league_id: L.id,
          budget: 25_000_000,
          current_balance: 25_000_000,
        })
        .select("id")
        .single();
      if (te) throw te;
      const tid = team.id;

      const ovr = 46 + Math.floor(Math.random() * 12);
      const mv = 1_500_000 + Math.floor(Math.random() * 8_000_000);

      for (let s = 0; s < 2; s++) {
        const { error: pe } = await supabase.from("players").insert({
          name: `${pick(FN)} ${L.country.slice(0, 3)} ${i + 1}-${s + 1}`,
          nationality: L.country,
          role: "ST",
          rating: ovr,
          hidden_ovr: ovr,
          age: 20 + Math.floor(Math.random() * 14),
          market_value: mv,
          peak_market_value: mv,
          team_id: tid,
        });
        if (pe) throw pe;
      }

      const { error: ge } = await supabase.from("players").insert({
        name: `GK ${L.country.slice(0, 3)} ${i + 1}`,
        nationality: L.country,
        role: "GK",
        rating: 50,
        hidden_ovr: 50,
        age: 22 + Math.floor(Math.random() * 12),
        market_value: 800_000,
        peak_market_value: 800_000,
        team_id: tid,
      });
      if (ge) throw ge;
    }
  }
}

async function seedFixtures() {
  const { data: leagues } = await supabase
    .from("leagues")
    .select("id, name, country, division");
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, league_id");

  const configs: LeagueConfig[] = [];
  for (const L of leagues ?? []) {
    const lt = (teams ?? []).filter((t) => t.league_id === L.id);
    if (lt.length !== 4) continue;
    configs.push({
      id: L.id,
      name: L.name,
      country: L.country,
      division: L.division as "D1" | "D2",
      teams: lt.map((t) => ({ id: t.id, name: t.name })),
    });
  }

  if (configs.length === 0) {
    console.warn("No league with 4 teams — skipping fixtures.");
    return;
  }

  const rows = buildSeasonMasterSchedule(configs);

  await supabase.from("fixtures").delete().eq("season_label", season);

  for (const r of rows) {
    if (r.competition === "league") {
      const { error } = await supabase.from("fixtures").insert({
        season_label: season,
        competition: "league",
        league_id: r.leagueId,
        home_team_id: r.homeTeamId,
        away_team_id: r.awayTeamId,
        week: r.week,
        status: "scheduled",
      });
      if (error) throw error;
    } else if (r.round === "QF") {
      const { error } = await supabase.from("fixtures").insert({
        season_label: season,
        competition: "regional_cup",
        country: r.country,
        home_team_id: r.homeTeamId,
        away_team_id: r.awayTeamId,
        week: r.week,
        cup_round: "QF",
        status: "scheduled",
      });
      if (error) throw error;
    }
  }
}

async function main() {
  console.log("Seeding domestic pyramid…");
  await ensureRoster();
  console.log("Inserting fixtures for", season);
  await seedFixtures();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
