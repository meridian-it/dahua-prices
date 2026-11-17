"use client";

import { useEffect, useState } from "react";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getProduct } from "@/lib/api";
import { closeQuickView, useQuickView } from "@/lib/quick-view";
import type { ProductFull } from "@/lib/types";

import { ProductImage } from "./bits";
import { OpenPageButton, ProductSummary, ProductTabs } from "./product-details";

/** Mounted once per layout; opened from any card via openQuickView(model). */
export function QuickViewHost() {
  const model = useQuickView();
  const [data, setData] = useState<ProductFull | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!model) return;
    const ctrl = new AbortController();
    setData(null);
    setError(null);
    getProduct(model, ctrl.signal)
      .then(setData)
      .catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    return () => ctrl.abort();
  }, [model]);

  return (
    <Sheet open={!!model} onOpenChange={(open) => !open && closeQuickView()}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl">
        <SheetHeader className="sr-only">
          <SheetTitle>{data?.model ?? model ?? "Товар"}</SheetTitle>
          <SheetDescription>{data?.title ?? "Быстрый просмотр товара"}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-full min-h-0">
          {error ? (
            <Empty className="h-80">
              <EmptyHeader>
                <EmptyTitle>Не удалось открыть товар</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : !data ? (
            <div className="space-y-4 p-6">
              <Skeleton className="aspect-[16/10] w-full rounded-xl" />
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : (
            <div className="flex flex-col gap-6 p-6 pt-12">
              <ProductImage
                src={data.image_url}
                alt={data.model}
                kind={data.kind}
                form={data.form_factor}
                pad="p-[8%]"
                hint={!data.image_url}
                className="aspect-[16/10] w-full rounded-xl ring-1 ring-foreground/10"
              />
              <ProductSummary p={data} actions={<OpenPageButton model={data.model} />} />
              <ProductTabs p={data} />
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
