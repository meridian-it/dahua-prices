"use client";

import { ArrowRight, GitCompareArrows, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useConfig } from "@/components/config-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCompare } from "@/lib/compare-store";
import { plural } from "@/lib/format";

/** Floating bar that keeps the comparison one click away while browsing. */
export function CompareDock() {
  const { settings } = useConfig();
  const { list, clear } = useCompare(settings.compare_max);
  const path = usePathname();
  if (!list.length || path.startsWith("/compare")) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border bg-popover/95 p-1.5 pl-4 shadow-xl backdrop-blur">
        <GitCompareArrows className="size-4 text-muted-foreground" />
        <span className="px-2 text-sm">
          <span className="font-semibold tabular-nums">{list.length}</span> {plural(list.length, "товар", "товара", "товаров")} в сравнении
        </span>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="rounded-full" onClick={clear} aria-label="Очистить" />}>
            <X />
          </TooltipTrigger>
          <TooltipContent>Очистить сравнение</TooltipContent>
        </Tooltip>
        <Button className="rounded-full" nativeButton={false} render={<Link href="/compare" />}>
          Сравнить <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
