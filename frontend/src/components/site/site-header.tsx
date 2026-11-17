"use client";

import { ChevronDown, GitCompareArrows } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useConfig } from "@/components/config-provider";
import { LogoMark } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getBreakdown, getCategories } from "@/lib/api";
import { useCompare } from "@/lib/compare-store";
import { TYPE_NAV, activeNav, navCount, navHref, type NavPreset } from "@/lib/nav";
import type { Breakdown, CategoryInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

import { SearchTrigger } from "./command-search";
import { ThemeToggle } from "./theme-toggle";

/** Shown inline; the rest of the types go to the "Ещё" menu. */
const PRIMARY = ["all", "new", "ip", "hdcvi", "ptz", "rec", "net", "intercom", "access", "alarm"];

function useCatalogMeta() {
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [categories, setCategories] = useState<CategoryInfo[] | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    getBreakdown(ctrl.signal).then(setBreakdown).catch(() => {});
    getCategories(ctrl.signal).then(setCategories).catch(() => {});
    return () => ctrl.abort();
  }, []);
  return { breakdown, categories };
}

function TypeNav() {
  const { breakdown, categories } = useCatalogMeta();
  const path = usePathname();
  const sp = useSearchParams();
  const onCatalog = path === "/";
  const active = onCatalog && !sp.get("category") && !sp.get("q") ? activeNav(sp) : null;
  const visible = (n: NavPreset) => navCount(n, breakdown) !== 0;
  const primary = TYPE_NAV.filter((n) => PRIMARY.includes(n.id) && visible(n));
  const more = TYPE_NAV.filter((n) => !PRIMARY.includes(n.id) && visible(n));
  const moreActive = !!active && more.some((n) => n.id === active.id);
  const category = onCatalog ? sp.get("category") : null;

  return (
    <nav className="no-scrollbar -mx-1 flex items-center gap-0.5 overflow-x-auto px-1 pb-2" aria-label="Разделы каталога">
      {primary.map((n) => (
        <Button
          key={n.id}
          size="sm"
          variant={active?.id === n.id ? "secondary" : "ghost"}
          className={cn("shrink-0 text-muted-foreground", active?.id === n.id && "text-foreground")}
          nativeButton={false}
          render={<Link href={navHref(n)} />}
        >
          {n.label}
        </Button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="sm"
              variant={moreActive || category ? "secondary" : "ghost"}
              className={cn("shrink-0 text-muted-foreground", (moreActive || category) && "text-foreground")}
            />
          }
        >
          Ещё <ChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuGroup>
            {more.map((n) => (
              <DropdownMenuItem key={n.id} render={<Link href={navHref(n)} />}>
                <n.icon />
                {n.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {categories?.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Разделы прайс-листа</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-[70vh] w-72 overflow-y-auto">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Как в Excel-прайсе</DropdownMenuLabel>
                    {categories.map((c) => (
                      <DropdownMenuItem key={c.slug} render={<Link href={`/?category=${c.slug}`} />}>
                        <span className="truncate">{c.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{c.count}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

export function SiteHeader() {
  const { settings } = useConfig();
  const { list } = useCompare(settings.compare_max);
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-1 px-4 sm:px-6">
        <div className="flex h-16 items-center gap-3 sm:gap-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <LogoMark className="size-8" />
            <span className="hidden leading-tight sm:grid">
              <span className="font-semibold tracking-tight">{settings.site_name}</span>
              <span className="text-xs text-muted-foreground">{settings.brand_vendor} · прайс-лист</span>
            </span>
          </Link>
          <div className="flex min-w-0 flex-1 justify-center">
            <SearchTrigger />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" nativeButton={false} render={<Link href="/compare" />} aria-label="Сравнение">
              <GitCompareArrows data-icon="inline-start" />
              <span className="hidden md:inline">Сравнение</span>
              {list.length ? <Badge className="h-5 min-w-5 px-1.5 tabular-nums">{list.length}</Badge> : null}
            </Button>
            <ThemeToggle />
          </div>
        </div>
        <Suspense fallback={<div className="h-9" />}>
          <TypeNav />
        </Suspense>
      </div>
    </header>
  );
}
