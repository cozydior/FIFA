import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CompetitionBrandLogo } from "@/components/CompetitionBrandLogo";
import { InternationalTournamentActionBar } from "@/components/InternationalTournamentActionBar";
import { getSimPreviewTestMode, getTournamentsMode } from "@/lib/appSettings";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";

export const revalidate = 60;

export default async function InternationalHubPage() {
  const previewEnabled = await getSimPreviewTestMode();
  const tournamentsMode = await getTournamentsMode();
  const defaultSeason = (await getCurrentSeasonLabel()) ?? "";
  const supabase = getSupabaseAdmin();
  const { data: nts } = await supabase
    .from("national_teams")
    .select("id, name, confederation, flag_emoji, countries(code, name, flag_emoji)")
    .order("name");

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
        International football
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        National teams are separate from domestic leagues. Each card below has <strong>Open</strong>,{" "}
        <strong>Start tournament</strong> (when season rules are satisfied), and optional batch sim on the tournament
        page. Fixtures also surface in <strong>Dashboard → Next up</strong>.{" "}
        <Link href="/countries" className="font-semibold text-emerald-800 hover:underline">
          Browse all national teams
        </Link>
        .
      </p>

      <div className="mt-6 rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">National teams</h2>
        <p className="mt-2 text-sm text-slate-600">
          If this list is empty, run “Seed national teams” in Admin (it creates one team per country).
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(nts ?? []).map((t) => {
            const c = t.countries as
              | { code: string; flag_emoji?: string | null }
              | { code: string; flag_emoji?: string | null }[]
              | null;
            const country = Array.isArray(c) ? c[0] ?? null : c;
            const href = country?.code ? `/countries/${country.code.toLowerCase()}` : null;
            const flag =
              (country?.flag_emoji as string | null) ??
              (t.flag_emoji as string | null) ??
              "🏳️";
            const inner = (
              <>
                <span className="font-semibold text-slate-900">
                  {flag} {t.name}
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {t.confederation}
                </span>
              </>
            );
            return (
              <li key={t.id}>
                {href ?
                  <Link
                    href={href}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 transition hover:border-emerald-400 hover:bg-white"
                  >
                    {inner}
                  </Link>
                : <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                    {inner}
                  </div>
                }
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-3 text-lg font-bold text-slate-900">
            <CompetitionBrandLogo slug="nations_league" className="h-12 w-12" />
            UEFA Nations League
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Group stage, knockouts, World Cup qualifiers. Set season in Admin; use current season below.
          </p>
          {defaultSeason ?
            <InternationalTournamentActionBar
              slug="nations_league"
              seasonLabel={defaultSeason}
              previewEnabled={previewEnabled}
              allowBootstrap={tournamentsMode}
            />
          : (
            <p className="mt-3 text-sm text-amber-800">Set a current season in Admin to enable start buttons.</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-3 text-lg font-bold text-slate-900">
            <CompetitionBrandLogo slug="gold_cup" className="h-12 w-12" />
            FIFA Gold Cup
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Regional tournament structure + match sim (same flow as Nations League).
          </p>
          {defaultSeason ?
            <InternationalTournamentActionBar
              slug="gold_cup"
              seasonLabel={defaultSeason}
              previewEnabled={previewEnabled}
              allowBootstrap={tournamentsMode}
            />
          : (
            <p className="mt-3 text-sm text-amber-800">Set a current season in Admin to enable start buttons.</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-3 text-lg font-bold text-slate-900">
            <CompetitionBrandLogo slug="world_cup" className="h-12 w-12" />
            World Cup
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Qualifiers fill the <strong>next season&apos;s</strong> World Cup after each regional tournament (top 2 per
            group). Draw balanced groups from Admin → Season (Tournaments mode) when ready, or use{" "}
            <strong>Draw World Cup groups</strong> here once eight teams are listed for this season.
          </p>
          {defaultSeason ?
            <InternationalTournamentActionBar
              slug="world_cup"
              seasonLabel={defaultSeason}
              previewEnabled={previewEnabled}
              allowBootstrap
            />
          : (
            <p className="mt-3 text-sm text-amber-800">Set a current season in Admin to enable start buttons.</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Friendlies</h2>
          <p className="mt-2 text-sm text-slate-600">
            Warm-up matches for nations that missed the World Cup. Schedules are created from{" "}
            <strong>Dashboard → International → Friendlies</strong>.
          </p>
          {defaultSeason ?
            <Link
              href={`/dashboard?group=international&sub=friendlies&season=${encodeURIComponent(defaultSeason)}`}
              className="mt-4 inline-flex rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-800"
            >
              Open Friendlies tab →
            </Link>
          : (
            <p className="mt-3 text-sm text-amber-800">Set a current season in Admin first.</p>
          )}
        </div>
      </div>
    </div>
  );
}

