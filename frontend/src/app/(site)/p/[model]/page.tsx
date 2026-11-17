import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ProductView } from "@/components/product/product-view";
import { Skeleton } from "@/components/ui/skeleton";
import { getProduct } from "@/lib/server-api";

type Params = { params: Promise<{ model: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { model } = await params;
  const decoded = decodeURIComponent(model);
  const p = await getProduct(decoded).catch(() => null);
  if (!p) return { title: decoded };
  return { title: `${p.model} — ${p.title}`, description: p.description.slice(0, 200) };
}

async function ProductLoader({ params }: Params) {
  const { model } = await params;
  const product = await getProduct(decodeURIComponent(model));
  if (!product) notFound();
  return <ProductView p={product} />;
}

function ProductSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-[1280px] gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Skeleton className="aspect-square rounded-2xl" />
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function ProductPage(props: Params) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductLoader {...props} />
    </Suspense>
  );
}
