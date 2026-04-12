import { TrophyIconDisplay } from "@/components/TrophyIconDisplay";
import {
  formatHonourWonWithDisplay,
  resolveTrophyDisplay,
  type TrophyDefinitionRow,
  type TrophySeasonDetail,
} from "@/lib/trophyCabinet";
import type { GroupedCabinet } from "@/lib/honourDisplayOrder";

export function HonourCategoryBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="border-t border-slate-200/90 pt-2">{children}</div>
    </div>
  );
}

export function HonourCabinetChips({
  groups,
  defMap,
  wonWithFlagMap,
  wonWithLogoMap,
}: {
  groups: GroupedCabinet[];
  defMap: Map<string, TrophyDefinitionRow>;
  wonWithFlagMap?: Map<string, string>;
  wonWithLogoMap?: Map<string, string>;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2.5">
      {groups.map(({ entry: tr, seasons }, i) => {
        const { label, iconUrl } = resolveTrophyDisplay(tr, defMap);
        const key = `${label}-${i}-${seasons.map((s) => `${s.season}-${s.won_with}`).join(",")}`;
        return (
          <div
            key={key}
            className="inline-flex max-w-full min-w-0 items-start gap-2.5 rounded-lg border border-slate-200/90 bg-slate-50/80 px-3 py-2"
          >
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center">
              <TrophyIconDisplay iconUrl={iconUrl} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[0.8125rem] font-bold leading-tight text-slate-900 sm:text-sm">{label}</p>
              <ul className="mt-1 space-y-0.5 text-[0.8125rem] leading-snug text-slate-600 sm:text-sm">
                {seasons.map((sd) => {
                  const wwFlag = sd.won_with ? wonWithFlagMap?.get(sd.won_with) : undefined;
                  const wwLogo = sd.won_with ? wonWithLogoMap?.get(sd.won_with) : undefined;
                  return (
                    <li key={`${sd.season}-${sd.won_with ?? ""}`} className="flex flex-wrap items-center gap-1">
                      <span className="font-semibold text-slate-700">{sd.season}</span>
                      {sd.won_with ?
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          ·
                          {wwLogo ?
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={wwLogo} alt="" className="h-4 w-4 rounded object-contain" />
                          : wwFlag ?
                            <span className="leading-none">{wwFlag}</span>
                          : null}
                          {formatHonourWonWithDisplay(sd.won_with)}
                        </span>
                      : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}
