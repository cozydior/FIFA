/**
 * Shared bracket visuals: horizontal rules, center arrow in a pill, optional vertical guide — used for
 * international and domestic knockout columns.
 */
export function BracketColumnConnector() {
  return (
    <div className="flex w-full shrink-0 flex-col items-center justify-center self-stretch py-2 md:w-12 md:py-0 lg:w-11">
      {/* Mobile / narrow: vertical flow between stacked rounds */}
      <div className="flex flex-col items-center md:hidden">
        <div className="h-5 w-px bg-indigo-200" />
        <div className="my-1 flex items-center gap-1 text-[0.65rem] font-bold text-indigo-400">
          <span className="h-px w-4 bg-indigo-200" />
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5">↓</span>
          <span className="h-px w-4 bg-indigo-200" />
        </div>
        <div className="h-5 w-px bg-indigo-200" />
      </div>
      {/* Desktop: same language as intl SF → F — spine line + horizontal ticks + arrow */}
      <div className="relative hidden min-h-[5rem] w-full flex-1 flex-col items-center justify-center md:flex">
        <div
          className="pointer-events-none absolute inset-y-6 left-1/2 w-px -translate-x-1/2 bg-indigo-200/90"
          aria-hidden
        />
        <div className="relative z-[1] flex w-full flex-col items-center justify-center gap-2">
          <div className="h-px w-full bg-indigo-200" />
          <div className="flex items-center gap-0.5">
            <span className="h-px w-2 bg-indigo-200" />
            <span className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[0.65rem] font-black uppercase text-indigo-500 shadow-sm">
              →
            </span>
            <span className="h-px w-2 bg-indigo-200" />
          </div>
          <div className="h-px w-full bg-indigo-200" />
        </div>
      </div>
    </div>
  );
}
