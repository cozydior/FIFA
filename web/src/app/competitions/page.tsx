import Link from "next/link";

const tabs = [
  {
    slug: "champions-league",
    title: "Champions League",
    blurb: "Group stage + knockout structure for qualified top clubs.",
    href: "/api/universe/champions-league",
  },
  {
    slug: "international",
    title: "International",
    blurb: "National teams live separately from leagues. Nations League / Gold Cup / World Cup surfaces.",
    href: "/competitions/international",
  },
  {
    slug: "uefa-nations-league",
    title: "UEFA Nations League",
    blurb: "National squads, groups, and knockout rounds in the international layer.",
    href: "/competitions/international/nations_league",
  },
  {
    slug: "gold-cup",
    title: "FIFA Gold Cup",
    blurb: "Regional international tournament (CONCACAF-style pool).",
    href: "/competitions/international/gold_cup",
  },
  {
    slug: "world-cup",
    title: "World Cup",
    blurb: "Qualification and final tournament weeks.",
    href: "/competitions/international/world_cup",
  },
];

export default function CompetitionsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
        Competitions Hub
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Continental and international competition surfaces.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {tabs.map((t) => (
          <div
            key={t.slug}
            className="rounded-2xl border border-slate-300/90 bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-bold text-slate-900">{t.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{t.blurb}</p>
            <Link
              href={t.href}
              className="mt-4 inline-flex text-sm font-semibold text-emerald-700 hover:underline"
            >
              Open →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
