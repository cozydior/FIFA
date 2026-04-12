"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/rankings", label: "Rankings" },
  { href: "/goats", label: "GOATs" },
  { href: "/countries", label: "National teams" },
  { href: "/admin", label: "Admin" },
] as const;

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-300/80 bg-white shadow-[0_1px_0_rgba(15,23,42,0.06)]">
      <div className="mx-auto flex h-[3.25rem] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="group flex items-center gap-2.5 text-slate-900 no-underline"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-800 text-lg shadow-sm ring-1 ring-emerald-700/30">
            ⚽
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-slate-500">
              Pro
            </span>
            <span className="text-base font-extrabold tracking-tight text-slate-900">
              Soccer Sim
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-0.5 sm:gap-1">
          {links.map(({ href, label }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "rounded-md px-2.5 py-1.5 text-sm font-semibold transition-colors sm:px-3",
                  active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
