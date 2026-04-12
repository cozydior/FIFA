import { AppHeader } from "@/components/AppHeader";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="mt-auto border-t border-slate-300/80 bg-white/90 py-4 text-center text-xs text-slate-500">
        Soccer Sim · Light mode · Management & match simulation
      </footer>
    </div>
  );
}
