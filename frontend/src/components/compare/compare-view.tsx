"use client";

import { Check, GitCompareArrows, Link2, Minus, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useConfig } from "@/components/config-provider";
import { Price, ProductImage, StatusBadges } from "@/components/product/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { compareProducts, suggest } from "@/lib/api";
import { useCompare } from "@/lib/compare-store";
import { formatPrice, productHref, warrantyText } from "@/lib/format";
import { notify } from "@/lib/notify";
import { openQuickView } from "@/lib/quick-view";
import type { CompareResponse, SuggestItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/** which spec values are better when larger / smaller */
const BEST: Record<string, "max" | "min"> = {
  megapixels: "max",
  ir_range: "max",
  led_range: "max",
  wdr: "max",
  sd_max: "max",
  streams: "max",
  channels: "max",
  ports: "max",
  poe_budget: "max",
  hdd_bays: "max",
  zoom: "max",
  sensitivity: "min",
};

function num(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = v.replace(",", ".").match(/\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  return null;
}

function bestOf(values: unknown[], mode: "max" | "min"): Set<number> {
  const nums = values.map(num);
  const valid = nums.filter((n): n is number => n !== null);
  if (valid.length < 2) return new Set();
  const target = mode === "max" ? Math.max(...valid) : Math.min(...valid);
  if (valid.every((v) => v === target)) return new Set();
  return new Set(nums.flatMap((n, i) => (n === target ? [i] : [])));
}

function AddProduct({ onAdd, disabled }: { onAdd: (model: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SuggestItem[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => suggest(q, ctrl.signal).then((r) => setItems(r.items)).catch(() => {}), 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" disabled={disabled} />}>
        <Plus data-icon="inline-start" /> Добавить товар
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder="Модель или характеристики…" />
          <CommandList>
            {q.trim().length >= 2 ? <CommandEmpty>Ничего не найдено</CommandEmpty> : null}
            <CommandGroup>
              {items.map((it) => (
                <CommandItem
                  key={it.id}
                  value={it.model}
                  onSelect={() => {
                    onAdd(it.model);
                    setQ("");
                    setOpen(false);
                  }}
                >
                  <ProductImage src={it.image_url} alt="" kind={it.kind} form={it.form_factor} pad="p-0.5" className="size-8 shrink-0 rounded" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{it.model}</div>
                    <div className="truncate text-xs text-muted-foreground">{it.title}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CompareView() {
  const { settings } = useConfig();
  const { list, remove, set, clear, toggle, max } = useCompare(settings.compare_max);
  const sp = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [diffOnly, setDiffOnly] = useState(false);
  const imported = useRef(false);

  // shared link: /compare?models=A,B,C replaces the local list once
  useEffect(() => {
    if (imported.current) return;
    imported.current = true;
    const fromUrl = (sp.get("models") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (fromUrl.length) {
      set(fromUrl);
      router.replace("/compare", { scroll: false });
    }
  }, [sp, set, router]);

  const key = list.join(",");
  useEffect(() => {
    if (!list.length) {
      setData(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    compareProducts(list, ctrl.signal)
      .then((res) => {
        setData(res);
        const found = res.items.map((i) => i.model);
        if (found.join(",") !== list.join(",")) set(found);
      })
      .catch(() => {})
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const items = useMemo(() => data?.items.filter((i) => list.includes(i.model)) ?? [], [data, list]);
  const idx = useMemo(() => items.map((i) => data!.items.indexOf(i)), [items, data]);

  const add = (m: string) => {
    const r = toggle(m);
    if (r === "full") notify(`В сравнении максимум ${max} товаров`, "warning");
  };
  const share = async () => {
    const url = `${location.origin}/compare?models=${encodeURIComponent(list.join(","))}`;
    try {
      await navigator.clipboard.writeText(url);
      notify("Ссылка на сравнение скопирована", "info");
    } catch {
      prompt("Ссылка на сравнение", url);
    }
  };

  if (!list.length) {
    return (
      <Empty className="min-h-[70vh]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitCompareArrows />
          </EmptyMedia>
          <EmptyTitle>Сравнение пока пусто</EmptyTitle>
          <EmptyDescription>Добавляйте товары кнопкой сравнения на карточке или найдите модель здесь.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <AddProduct onAdd={add} />
          <Button variant="ghost" nativeButton={false} render={<Link href="/" />}>
            В каталог
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const Row = ({
    label,
    cells,
    different,
    best,
  }: {
    label: string;
    cells: React.ReactNode[];
    different: boolean;
    best?: Set<number>;
  }) =>
    diffOnly && !different ? null : (
      <TableRow>
        <TableCell className="sticky left-0 z-10 bg-card text-muted-foreground">{label}</TableCell>
        {cells.map((c, i) => (
          <TableCell
            key={i}
            className={cn("border-l whitespace-normal", different && "font-medium", best?.has(i) && "bg-success/10 text-success")}
          >
            {c}
          </TableCell>
        ))}
      </TableRow>
    );

  const Section = ({ title }: { title: string }) => (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={items.length + 1} className="bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </TableCell>
    </TableRow>
  );

  const prices = items.map((i) => i.price);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Сравнение</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {list.length} из {max} · лучшие значения подсвечены зелёным
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
            <Switch id="diff" checked={diffOnly} onCheckedChange={setDiffOnly} />
            <Label htmlFor="diff">Только различия</Label>
          </div>
          <AddProduct onAdd={add} disabled={list.length >= max} />
          <Button variant="outline" onClick={share}>
            <Link2 data-icon="inline-start" /> Поделиться
          </Button>
          <Button variant="destructive" onClick={clear}>
            <Trash2 data-icon="inline-start" /> Очистить
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <Skeleton className="h-[480px] w-full rounded-xl" />
      ) : (
        <Card className={cn("py-0 transition-opacity", loading && "opacity-60")}>
          <Table className="table-fixed" style={{ minWidth: 200 + items.length * 220 }}>
            <colgroup>
              <col className="w-[200px]" />
              {items.map((i) => (
                <col key={i.model} />
              ))}
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-10 bg-card" />
                {items.map((p) => (
                  <TableHead key={p.model} className="relative h-auto border-l p-3 align-top whitespace-normal">
                    <Tooltip>
                      <TooltipTrigger
                        render={<Button variant="ghost" size="icon-sm" className="absolute top-2 right-2 z-10" onClick={() => remove(p.model)} aria-label="Убрать" />}
                      >
                        <X />
                      </TooltipTrigger>
                      <TooltipContent>Убрать из сравнения</TooltipContent>
                    </Tooltip>
                    <button type="button" onClick={() => openQuickView(p.model)} className="block w-full text-left">
                      <ProductImage src={p.image_url} alt={p.model} kind={p.kind} form={p.form_factor} className="mx-auto mb-3 aspect-[4/3] w-full max-w-60 rounded-lg" />
                      <StatusBadges p={p} className="mb-1.5" />
                      <div className="pr-6 font-semibold text-foreground [overflow-wrap:anywhere] hover:text-primary">{p.model}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs font-normal text-muted-foreground">{p.title}</div>
                    </button>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Price p={p} />
                      <Button variant="link" size="xs" nativeButton={false} render={<Link href={productHref(p.model)} />}>
                        Страница
                      </Button>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <Section title="Основное" />
              {settings.show_prices ? (
                <Row
                  label={settings.price_label}
                  different={new Set(prices).size > 1}
                  best={bestOf(prices, "min")}
                  cells={items.map((p) => (p.price !== null ? formatPrice(p.price, settings) : settings.price_on_request_text))}
                />
              ) : null}
              <Row label="Гарантия" different={new Set(items.map((p) => p.warranty_months)).size > 1} cells={items.map((p) => warrantyText(p.warranty_months) || "—")} />
              <Row label="Раздел прайса" different={new Set(items.map((p) => p.category?.name)).size > 1} cells={items.map((p) => p.category?.name ?? "—")} />

              {data?.specs.length ? <Section title="Характеристики" /> : null}
              {data?.specs.map((row) => {
                const vals = idx.map((i) => row.values[i]);
                return (
                  <Row
                    key={row.key}
                    label={row.label}
                    different={new Set(vals.map(String)).size > 1}
                    best={BEST[row.key] ? bestOf(vals, BEST[row.key]) : undefined}
                    cells={vals.map((v) => (v === null || v === undefined ? <Minus className="size-4 text-muted-foreground/50" /> : String(v)))}
                  />
                );
              })}

              {data?.features.length ? <Section title="Возможности" /> : null}
              {data?.features.map((row) => {
                const vals = idx.map((i) => row.values[i]);
                return (
                  <Row
                    key={row.key}
                    label={row.label}
                    different={new Set(vals).size > 1}
                    cells={vals.map((v) =>
                      v ? <Check className="size-4 text-success" strokeWidth={2.5} /> : <Minus className="size-4 text-muted-foreground/50" />,
                    )}
                  />
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      {diffOnly ? (
        <p className="text-center text-xs text-muted-foreground">
          Скрыты одинаковые строки · <Badge variant="outline">{items.length} товара</Badge>
        </p>
      ) : null}
    </div>
  );
}
