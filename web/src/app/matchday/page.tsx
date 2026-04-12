import { Suspense } from "react";
import MatchDayClient from "./MatchDayClient";

export default function MatchDayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center py-24 text-zinc-500">
          Loading…
        </div>
      }
    >
      <MatchDayClient />
    </Suspense>
  );
}
