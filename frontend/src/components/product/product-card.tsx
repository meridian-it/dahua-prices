"use client";

import Link from "next/link";

import { useConfig } from "@/components/config-provider";
import { HighlightModel } from "@/components/highlight";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompare } from "@/lib/compare-store";
import { productHref } from "@/lib/format";
import { quickViewClick } from "@/lib/quick-view";
import type { ProductBrief } from "@/lib/types";
import { cn } from "@/lib/utils";

import { CompareToggle, Price, ProductImage, StatusBadges } from "./bits";

export function ProductCard({ p, tokens = [] }: { p: ProductBrief; tokens?: string[] }) {
  const { settings } = useConfig();
  const { has } = useCompare(settings.compare_max);
  const inCompare = has(p.model);
  const specs = p.key_specs.slice(0, 4).join(" · ");

  return (
    <Card
      className={cn(
        "group/product relative gap-0 overflow-hidden py-0 transition-shadow duration-200 hover:shadow-lg hover:ring-foreground/15",
      )}
    >
      <Link href={productHref(p.model)} onClick={quickViewClick(p.model)} className="absolute inset-0 z-0" aria-label={p.model} />

      <div className="pointer-events-none relative">
        <ProductImage
          src={p.image_url}
          alt={p.model}
          kind={p.kind}
          form={p.form_factor}
          className={cn("aspect-[4/3] w-full transition-transform duration-300 group-hover/product:scale-[1.03]", p.is_eol && "opacity-70")}
        />
        <StatusBadges p={p} className="absolute top-3 left-3" />
      </div>
      <div
        className={cn(
          "absolute top-2.5 right-2.5 z-10 transition-opacity",
          !inCompare && "opacity-0 group-hover/product:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100",
        )}
      >
        <CompareToggle model={p.model} />
      </div>

      <div className="pointer-events-none flex flex-1 flex-col gap-1 border-t p-4">
        <h3 className="text-[15px] leading-snug font-semibold tracking-tight [overflow-wrap:anywhere]">
          <HighlightModel model={p.model} tokens={tokens} />
        </h3>
        <p className="line-clamp-2 text-[13px] text-muted-foreground sm:line-clamp-1" title={p.title}>
          {p.title}
        </p>
        {specs ? <p className="line-clamp-1 text-xs text-muted-foreground/80">{specs}</p> : null}
        <div className="mt-auto pt-3">
          <Price p={p} />
        </div>
      </div>
    </Card>
  );
}

export function ProductCardSkeleton() {
  return (
    <Card className="gap-0 py-0">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="space-y-2 border-t p-4">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="mt-4 h-6 w-24" />
      </div>
    </Card>
  );
}
