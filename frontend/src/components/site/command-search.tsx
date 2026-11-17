"use client";

import { ArrowRight, FolderOpen, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useConfig } from "@/components/config-provider";
import { ProductImage } from "@/components/product/bits";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { suggest } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { TYPE_NAV, navHref } from "@/lib/nav";
import { openQuickView } from "@/lib/quick-view";
import type { SuggestResponse } from "@/lib/types";

const OPEN_EVENT = "it-trade:open-search";
export const openCommandSearch = () => window.dispatchEvent(new Event(OPEN_EVENT));

export function SearchTrigger() {
  return (
    <button
      type="button"
      onClick={openCommandSearch}
      className="flex h-10 w-full max-w-2xl items-center gap-2.5 rounded-xl border bg-muted/50 px-3.5 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground"
    >
      <Search className="size-4 shrink-0" />
      <span className="truncate sm:hidden">Поиск</span>
      <span className="hidden truncate sm:inline">Модель или задача: «уличная 4мп poe до 15 тыс»</span>
      <span className="ml-auto hidden items-center gap-1 sm:flex">
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}

export function CommandSearch() {
  const { settings } = useConfig();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable;
      if ((e.key === "k" || e.key === "K" || e.key === "л") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setData(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setBusy(true);
      suggest(term, ctrl.signal)
        .then(setData)
        .catch(() => {})
        .finally(() => !ctrl.signal.aborted && setBusy(false));
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const searchAll = () => go(`/?q=${encodeURIComponent(q.trim())}`);
  const examples = settings.search_examples.split("\n").map((s) => s.trim()).filter(Boolean);
  const term = q.trim();

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Поиск по каталогу" description="Модель, характеристики или задача" className="sm:max-w-2xl">
      <Command shouldFilter={false} loop>
        <CommandInput autoFocus value={q} onValueChange={setQ} placeholder="Модель или задача: «уличная 4мп poe до 15 тыс»" />
        <CommandList className="max-h-[min(60vh,520px)]">
          {term.length >= 2 && data ? (
            <>
              {data.chips.length || data.layout_fixed ? (
                <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3 pb-1 text-xs text-muted-foreground">
                  <Sparkles className="size-3.5 text-primary" />
                  {data.layout_fixed ? <span>раскладка → «{data.layout_fixed}»</span> : null}
                  <span>Понял как:</span>
                  {data.chips.map((c, i) => (
                    <Badge key={i} variant="secondary">
                      {c.label}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <CommandGroup>
                <CommandItem value="all" onSelect={searchAll}>
                  <Search />
                  <span>
                    Все результаты по «<span className="font-medium">{term}</span>»
                    <span className="ml-1.5 text-muted-foreground">{data.total}</span>
                  </span>
                  <ArrowRight className="ml-auto" />
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading={data.fuzzy ? "Точных совпадений нет — похожие" : "Товары"}>
                {data.items.map((it) => (
                  <CommandItem
                    key={it.id}
                    value={`p:${it.model}`}
                    onSelect={() => {
                      setOpen(false);
                      openQuickView(it.model);
                    }}
                    className="gap-3 py-2"
                  >
                    <ProductImage src={it.image_url} alt="" kind={it.kind} form={it.form_factor} pad="p-0.5" className="size-10 shrink-0 rounded-md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{it.model}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[it.title, ...it.key_specs].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {settings.show_prices ? (
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {it.price !== null ? formatPrice(it.price, settings) : settings.price_on_request_text}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
              {data.categories.length ? (
                <CommandGroup heading="Разделы прайса">
                  {data.categories.map((c) => (
                    <CommandItem key={c.slug} value={`c:${c.slug}`} onSelect={() => go(`/?category=${c.slug}`)}>
                      <FolderOpen />
                      {c.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </>
          ) : term.length >= 2 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner /> Ищем…
            </div>
          ) : (
            <>
              {examples.length ? (
                <CommandGroup heading="Попробуйте умный поиск">
                  {examples.map((ex) => (
                    <CommandItem key={ex} value={`ex:${ex}`} onSelect={() => setQ(ex)}>
                      <Sparkles />
                      {ex}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              <CommandGroup heading="Разделы">
                {TYPE_NAV.slice(1).map((n) => (
                  <CommandItem key={n.id} value={`n:${n.id}`} onSelect={() => go(navHref(n))}>
                    <n.icon />
                    {n.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {term.length >= 2 && data && !data.items.length ? <CommandEmpty>Ничего не найдено</CommandEmpty> : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
