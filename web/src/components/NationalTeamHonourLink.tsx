import Link from "next/link";
import type { NationalHonourRef } from "@/lib/competitionHistory";

/** Flag + national team name; links to `/countries/[code]` when a country code exists. */
export function NationalTeamHonourLink({
  team,
  className,
}: {
  team: NationalHonourRef;
  className?: string;
}) {
  const code = team.countryCode?.trim().toLowerCase();
  const inner = (
    <>
      <span className="mr-1.5">{team.flag}</span>
      {team.name}
    </>
  );
  if (!code) {
    return (
      <span className={className ?? "inline-flex items-center font-semibold text-slate-900"}>
        {inner}
      </span>
    );
  }
  return (
    <Link
      href={`/countries/${code}`}
      className={
        className ?
          `${className} hover:text-emerald-800 hover:underline`
        : "inline-flex items-center font-semibold text-slate-900 hover:text-emerald-800 hover:underline"
      }
    >
      {inner}
    </Link>
  );
}
