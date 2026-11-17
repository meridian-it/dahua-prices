import { Suspense } from "react";

import { Catalog } from "@/components/catalog/catalog";
import { ProductCardSkeleton } from "@/components/product/product-card";
import { Skeleton } from "@/components/ui/skeleton";

function CatalogFallback() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-6 sm:px-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-9 w-full" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<CatalogFallback />}>
      <Catalog />
    </Suspense>
  );
}
