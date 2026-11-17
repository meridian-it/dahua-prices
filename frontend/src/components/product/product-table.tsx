"use client";

import Link from "next/link";

import { useConfig } from "@/components/config-provider";
import { HighlightModel } from "@/components/highlight";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { productHref, warrantyText } from "@/lib/format";
import { openQuickView, quickViewClick } from "@/lib/quick-view";
import type { ProductBrief } from "@/lib/types";
import { cn } from "@/lib/utils";

import { CompareToggle, Price, ProductImage, StatusBadges } from "./bits";

export function ProductTable({ items, tokens }: { items: ProductBrief[]; tokens: string[] }) {
  const { settings } = useConfig();
  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[72px] pl-4" />
            <TableHead className="min-w-64">Модель</TableHead>
            <TableHead className="hidden w-[34%] lg:table-cell">Характеристики</TableHead>
            <TableHead className="hidden w-24 md:table-cell">Гарантия</TableHead>
            <TableHead className="w-32 text-right">{settings.show_prices ? settings.price_label : ""}</TableHead>
            <TableHead className="w-14 pr-4" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow key={p.id} onClick={() => openQuickView(p.model)} className={cn("group/row cursor-pointer", p.is_eol && "opacity-80")}>
              <TableCell className="pl-4">
                <ProductImage src={p.image_url} alt={p.model} kind={p.kind} form={p.form_factor} pad="p-1" className="size-12 rounded-lg" />
              </TableCell>
              <TableCell className="min-w-64 whitespace-normal">
                <Link href={productHref(p.model)} onClick={(e) => { e.stopPropagation(); quickViewClick(p.model)(e); }} className="block">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold tracking-tight [overflow-wrap:anywhere] group-hover/row:text-primary">
                      <HighlightModel model={p.model} tokens={tokens} />
                    </span>
                    <StatusBadges p={p} />
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
                    {p.title}
                  </span>
                </Link>
              </TableCell>
              <TableCell className="hidden whitespace-normal lg:table-cell">
                <span className="text-sm text-muted-foreground">{p.key_specs.slice(0, 5).join(" · ")}</span>
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{warrantyText(p.warranty_months)}</TableCell>
              <TableCell className="text-right">
                <Price p={p} size="sm" className="items-end" />
              </TableCell>
              <TableCell className="pr-4">
                <CompareToggle model={p.model} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export function ProductTableSkeleton() {
  return (
    <Card className="gap-0 py-0">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
          <Skeleton className="size-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-3 w-96 max-w-full" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </Card>
  );
}
