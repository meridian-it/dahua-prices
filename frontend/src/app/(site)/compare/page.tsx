import type { Metadata } from "next";
import { Suspense } from "react";

import { CompareView } from "@/components/compare/compare-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Сравнение" };

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
          <Skeleton className="h-[480px] w-full rounded-xl" />
        </div>
      }
    >
      <CompareView />
    </Suspense>
  );
}
