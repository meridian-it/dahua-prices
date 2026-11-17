"use client";

import { LayoutGrid, Rows3, SearchX, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { openCommandSearch } from "@/components/site/command-search";

import { useConfig } from "@/components/config-provider";
import { ProductCard, ProductCardSkeleton } from "@/components/product/product-card";
import { ProductTable, ProductTableSkeleton } from "@/components/product/product-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { searchProducts } from "@/lib/api";
import { formatNumber, plural } from "@/lib/format";
import { activeNav } from "@/lib/nav";
import type { ProductBrief, SearchResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

import { FilterBar } from "./filters";
import { EMPTY_FILTERS, type ListKey, useCatalogParams } from "./use-catalog-params";

const SORTS = {
  relevance: "По умолчанию",
  price_asc: "Сначала дешевле",
  price_desc: "Сначала дороже",
  mp_desc: "Больше мегапикселей",
  new: "Сначала новинки",
  model: "По названию",
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Catalog() {
  const { settings, labels } = useConfig();
  const { state, update, toggleIn, apiQuery, sp } = useCatalogParams();
  const [data, setData] = useState<SearchResponse | null>(null);
  const [items, setItems] = useState<ProductBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(1);
  const busyRef = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const view = state.view || settings.default_view;

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    searchProducts(apiQuery, ctrl.signal)
      .then((res) => {
        setData(res);
        setItems(res.items);
        pageRef.current = 1;
      })
      .catch((e: Error) => e.name !== "AbortError" && setError(e.message || "Не удалось загрузить каталог"))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [apiQuery]);

  const total = data?.total ?? 0;
  const hasMore = items.length < total;

  const loadMore = useCallback(async () => {
    if (busyRef.current || loading || !hasMore) return;
    busyRef.current = true;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams(apiQuery);
      qs.set("page", String(pageRef.current + 1));
      qs.set("facets", "false");
      const res = await searchProducts(qs.toString());
      pageRef.current += 1;
      setItems((prev) => [...prev, ...res.items.filter((n) => !prev.some((p) => p.id === n.id))]);
    } finally {
      busyRef.current = false;
      setLoadingMore(false);
    }
  }, [apiQuery, hasMore, loading]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && loadMore(), { rootMargin: "900px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // ---- heading
  const nav = !state.q && !state.category.length ? activeNav(sp) : null;
  const catName = (slug: string) => data?.facets?.category.find((c) => c.value === slug)?.label ?? slug;
  const title = state.q
    ? `Поиск: «${state.q}»`
    : nav && nav.id !== "all"
      ? nav.label
      : state.category.length === 1
        ? catName(state.category[0])
        : "Все товары";

  // ---- active filter chips
  const chips: { key: string; label: string; remove: () => void }[] = [];
  const add = (key: "category" | "kind" | "tech" | "form" | "mp" | "features", label: (v: string) => string) => {
    for (const v of state[key]) chips.push({ key: `${key}:${v}`, label: label(v), remove: () => toggleIn(key, v) });
  };
  if (!nav || nav.id === "all") {
    add("kind", (v) => labels.kinds[v] ?? v);
    add("tech", (v) => labels.tech[v] ?? v);
    add("form", (v) => labels.forms[v] ?? v);
  }
  if (!(state.category.length === 1 && !state.q)) add("category", catName);
  add("mp", (v) => `${v} Мп`);
  add("features", (v) => labels.features[v] ?? v);
  if (state.price_min || state.price_max) {
    chips.push({
      key: "price",
      label: [state.price_min && `от ${formatNumber(+state.price_min)}`, state.price_max && `до ${formatNumber(+state.price_max)}`, settings.currency_symbol]
        .filter(Boolean)
        .join(" "),
      remove: () => update({ price_min: "", price_max: "" }),
    });
  }
  if (state.is_new && nav?.id !== "new") chips.push({ key: "new", label: "Новинки", remove: () => update({ is_new: false }) });
  if (state.eol !== "default")
    chips.push({
      key: "eol",
      label: { include: "С EOL", hide: "Без EOL", only: "Только EOL" }[state.eol] ?? state.eol,
      remove: () => update({ eol: "default" }),
    });

  const qi = data?.query;
  const tokens = qi?.model_tokens ?? [];
  const resetAll = () => update({ ...EMPTY_FILTERS, q: "" });

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      {/* heading */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
          {state.q ? (
            <button type="button" onClick={openCommandSearch} className="text-left hover:underline hover:decoration-muted-foreground/40 hover:underline-offset-4">
              «{state.q}»
            </button>
          ) : (
            title
          )}
        </h1>
        <span className="text-sm text-muted-foreground tabular-nums">
          {loading && !data ? "загружаем…" : `${formatNumber(total)} ${plural(total, "товар", "товара", "товаров")}`}
        </span>
        {state.q ? (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => update({ q: "", sort: "relevance" })}>
            <X data-icon="inline-start" /> Сбросить поиск
          </Button>
        ) : null}
      </div>

      {/* toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <FilterBar
              facets={data?.facets ?? null}
              state={state}
              update={update}
              toggleIn={toggleIn}
              activeCount={chips.length}
              total={total}
              onReset={() => update(EMPTY_FILTERS)}
              locked={nav && nav.id !== "all" ? (Object.keys(nav.params).filter((k) => k !== "is_new") as ListKey[]) : []}
            />
          </div>
          <Select items={SORTS} value={state.sort} onValueChange={(v) => update({ sort: String(v) })}>
            <SelectTrigger className="hidden w-auto min-w-44 md:flex" aria-label="Сортировка">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {Object.entries(SORTS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup
            variant="outline"
            value={[view]}
            onValueChange={(v) => v[0] && update({ view: v[0] as "grid" | "table" }, { replace: true })}
            className="hidden sm:flex"
            spacing={0}
          >
            <ToggleGroupItem value="grid" aria-label="Карточки">
              <LayoutGrid />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="Таблица">
              <Rows3 />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {(state.q && state.smart && qi?.chips.length) || (state.q && !state.smart) || qi?.layout_fixed || chips.length ? (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            {state.q && state.smart && qi?.chips.length ? (
              <>
                <Sparkles className="size-4 text-primary" />
                <span className="text-muted-foreground">Понял как</span>
                {qi.chips.map((c, i) => (
                  <Badge key={i} variant="outline">
                    {c.label}
                  </Badge>
                ))}
                <Button variant="link" size="sm" className="text-muted-foreground" onClick={() => update({ smart: false })}>
                  искать как текст
                </Button>
              </>
            ) : null}
            {state.q && !state.smart ? (
              <Button variant="link" size="sm" onClick={() => update({ smart: true })}>
                <Sparkles data-icon="inline-start" /> Включить умный поиск
              </Button>
            ) : null}
            {qi?.layout_fixed ? <span className="text-xs text-muted-foreground">раскладка исправлена → «{qi.layout_fixed}»</span> : null}
            {chips.length && state.q ? <span className="mx-1 h-4 w-px bg-border" /> : null}
            {chips.map((c) => (
              <Badge key={c.key} variant="secondary" className="h-7 gap-1 pr-1.5 pl-2.5" render={<button type="button" onClick={c.remove} />}>
                {c.label}
                <X className="size-3.5! opacity-60" />
              </Badge>
            ))}
            {chips.length > 1 ? (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => update(EMPTY_FILTERS)}>
                Очистить всё
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {qi?.fuzzy && items.length ? (
        <Alert>
          <SearchX />
          <AlertDescription>
            Точных совпадений нет — показаны похожие модели.
            {qi.suggestion ? (
              <>
                {" "}Возможно, вы искали{" "}
                <Button variant="link" className="h-auto p-0" onClick={() => update({ q: qi.suggestion! })}>
                  {qi.suggestion}
                </Button>
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* results */}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : loading && !items.length ? (
        view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: 10 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <ProductTableSkeleton />
        )
      ) : items.length ? (
        <div className={cn("transition-opacity duration-200", loading && "opacity-50")}>
          {view === "grid" ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {items.map((p) => (
                <ProductCard key={p.id} p={p} tokens={tokens} />
              ))}
            </div>
          ) : (
            <ProductTable items={items} tokens={tokens} />
          )}
          <div ref={sentinel} className="h-px" />
          <div className="mt-6 flex justify-center pb-16">
            {hasMore ? (
              <Button variant="outline" size="lg" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Spinner data-icon="inline-start" /> : null}
                Показать ещё {formatNumber(total - items.length)}
              </Button>
            ) : items.length > 12 ? (
              <span className="text-sm text-muted-foreground">Показаны все {formatNumber(total)}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>Ничего не нашлось</EmptyTitle>
            <EmptyDescription>
              Уберите часть фильтров или поищите по фрагменту модели — например «2449» или «HDW1431».
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={resetAll}>Показать все товары</Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}
