"use client";

import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import { useConfig } from "@/components/config-provider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { formatNumber, plural } from "@/lib/format";
import type { Facets } from "@/lib/types";
import { cn } from "@/lib/utils";

import type { CatalogState, ListKey } from "./use-catalog-params";

type Option = { value: string; label: string; count: number };
type Update = (p: Partial<CatalogState>) => void;

const FACET_TITLES: Record<ListKey, string> = {
  mp: "Разрешение",
  form: "Форм-фактор",
  tech: "Технология",
  kind: "Тип",
  features: "Возможности",
  category: "Раздел прайса",
};
/** Most useful first: the first two available ones get their own button on the toolbar. */
const FACET_ORDER: ListKey[] = ["mp", "form", "tech", "kind", "features", "category"];

function facetOptions(f: Facets | null, key: ListKey): Option[] {
  if (!f) return [];
  if (key === "mp") return f.mp.map((m) => ({ ...m, value: String(m.value) }));
  return f[key];
}

function selectedLabel(options: Option[], selected: string[]) {
  if (selected.length > 1) return `${selected.length}`;
  return options.find((o) => o.value === selected[0])?.label ?? selected[0];
}

/** Toolbar facet: Popover + Command list with checkboxes (shadcn data-table style). */
function FacetPopover({
  title,
  options,
  selected,
  onToggle,
  onClear,
}: {
  title: string;
  options: Option[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant={selected.length ? "secondary" : "outline"} className="shrink-0" />}>
        <span className="max-w-48 truncate">
          {title}
          {selected.length ? <span className="font-normal text-muted-foreground">: {selectedLabel(options, selected)}</span> : null}
        </span>
        <ChevronDown data-icon="inline-end" className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          {options.length > 8 ? <CommandInput placeholder={title} /> : null}
          <CommandList className="max-h-80">
            <CommandEmpty>Ничего не найдено</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const on = selected.includes(o.value);
                return (
                  <CommandItem key={o.value} value={o.label} onSelect={() => onToggle(o.value)} disabled={!on && o.count === 0}>
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[4px] border",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {on ? <Check className="size-3" /> : null}
                    </span>
                    <span className="truncate">{o.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">{o.count}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {selected.length ? (
            <div className="border-t p-1">
              <Button variant="ghost" size="sm" className="w-full" onClick={onClear}>
                Сбросить
              </Button>
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PriceRange({
  facets,
  min,
  max,
  onChange,
}: {
  facets: Facets | null;
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
}) {
  const lo = Math.floor(facets?.price.min ?? 0);
  const hi = Math.ceil(facets?.price.max ?? 100000);
  const [a, setA] = useState(min);
  const [b, setB] = useState(max);
  const [range, setRange] = useState<[number, number]>([min ? +min : lo, max ? +max : hi]);
  useEffect(() => {
    setA(min);
    setB(max);
    setRange([min ? +min : lo, max ? +max : hi]);
  }, [min, max, lo, hi]);
  const commit = (x = a, y = b) => (x !== min || y !== max) && onChange(x, y);

  return (
    <div className="flex flex-col gap-4 pt-1">
      <Slider
        min={lo}
        max={hi}
        step={Math.max(10, Math.round((hi - lo) / 200 / 10) * 10)}
        value={range}
        onValueChange={(v) => {
          const [x, y] = v as number[];
          setRange([x, y]);
          setA(x <= lo ? "" : String(x));
          setB(y >= hi ? "" : String(y));
        }}
        onValueCommitted={(v) => {
          const [x, y] = v as number[];
          commit(x <= lo ? "" : String(x), y >= hi ? "" : String(y));
        }}
      />
      <div className="flex items-center gap-2">
        <Input
          inputMode="numeric"
          placeholder={`от ${formatNumber(lo)}`}
          value={a}
          onChange={(e) => setA(e.target.value.replace(/\D/g, ""))}
          onBlur={() => commit()}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        <span className="text-muted-foreground">—</span>
        <Input
          inputMode="numeric"
          placeholder={`до ${formatNumber(hi)}`}
          value={b}
          onChange={(e) => setB(e.target.value.replace(/\D/g, ""))}
          onBlur={() => commit()}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
      </div>
    </div>
  );
}

function PricePopover({ facets, state, update }: { facets: Facets | null; state: CatalogState; update: Update }) {
  const { settings } = useConfig();
  const active = !!(state.price_min || state.price_max);
  const label = [state.price_min && `от ${formatNumber(+state.price_min)}`, state.price_max && `до ${formatNumber(+state.price_max)}`]
    .filter(Boolean)
    .join(" ");
  return (
    <Popover>
      <PopoverTrigger render={<Button variant={active ? "secondary" : "outline"} className="shrink-0" />}>
        <span>
          Цена
          {active ? <span className="font-normal text-muted-foreground">: {label}</span> : null}
        </span>
        <ChevronDown data-icon="inline-end" className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-80 gap-3" align="start">
        <div className="text-sm font-medium">Цена, {settings.currency_symbol}</div>
        <PriceRange facets={facets} min={state.price_min} max={state.price_max} onChange={(a, b) => update({ price_min: a, price_max: b })} />
      </PopoverContent>
    </Popover>
  );
}

function CheckList({ options, selected, onToggle }: { options: Option[]; selected: string[]; onToggle: (v: string) => void }) {
  const [all, setAll] = useState(false);
  const LIMIT = 8;
  const shown = all ? options : options.slice(0, LIMIT);
  return (
    <div className="flex flex-col gap-0.5">
      {shown.map((o) => {
        const id = `f-${o.value}`;
        const on = selected.includes(o.value);
        return (
          <Field key={o.value} orientation="horizontal" className="rounded-md px-1 py-1.5 hover:bg-muted/60" data-disabled={!on && o.count === 0}>
            <Checkbox id={id} checked={on} disabled={!on && o.count === 0} onCheckedChange={() => onToggle(o.value)} />
            <FieldLabel htmlFor={id} className="flex-1 font-normal">
              {o.label}
            </FieldLabel>
            <span className="text-xs text-muted-foreground tabular-nums">{o.count}</span>
          </Field>
        );
      })}
      {options.length > LIMIT ? (
        <Button variant="link" size="sm" className="self-start px-1" onClick={() => setAll((v) => !v)}>
          {all ? "Свернуть" : `Показать все ${options.length}`}
        </Button>
      ) : null}
    </div>
  );
}

/** Every filter in one place. Changes apply immediately; the footer shows the live result count. */
function FiltersSheet({
  open,
  onOpenChange,
  facets,
  state,
  update,
  toggleIn,
  total,
  activeCount,
  onReset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  facets: Facets | null;
  state: CatalogState;
  update: Update;
  toggleIn: (k: ListKey, v: string) => void;
  total: number;
  activeCount: number;
  onReset: () => void;
}) {
  const { settings } = useConfig();
  const keys = FACET_ORDER.filter((k) => facetOptions(facets, k).length > 1 || state[k].length);
  const defaultOpen = ["price", ...keys.slice(0, 2), ...keys.filter((k) => state[k].length), "status"];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Фильтры</SheetTitle>
          <SheetDescription>Результат обновляется сразу</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <Accordion multiple defaultValue={defaultOpen} className="px-4">
            {settings.show_prices ? (
              <AccordionItem value="price">
                <AccordionTrigger className="py-4">Цена, {settings.currency_symbol}</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <PriceRange facets={facets} min={state.price_min} max={state.price_max} onChange={(a, b) => update({ price_min: a, price_max: b })} />
                </AccordionContent>
              </AccordionItem>
            ) : null}
            {keys.map((k) => (
              <AccordionItem key={k} value={k}>
                <AccordionTrigger className="py-4">
                  <span className="flex items-center gap-2">
                    {FACET_TITLES[k]}
                    {state[k].length ? <Badge className="h-5 min-w-5 px-1.5">{state[k].length}</Badge> : null}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <CheckList options={facetOptions(facets, k)} selected={state[k]} onToggle={(v) => toggleIn(k, v)} />
                </AccordionContent>
              </AccordionItem>
            ))}
            <AccordionItem value="status">
              <AccordionTrigger className="py-4">Статус</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4 pb-4">
                <Field orientation="horizontal" className="px-1">
                  <Checkbox id="f-new" checked={state.is_new} onCheckedChange={(v) => update({ is_new: !!v })} />
                  <FieldLabel htmlFor="f-new" className="font-normal">
                    Только новинки
                  </FieldLabel>
                </Field>
                <RadioGroup value={state.eol} onValueChange={(v) => update({ eol: String(v) })} className="gap-1 px-1">
                  <div className="pb-1 text-xs text-muted-foreground">Снятые с производства</div>
                  {[
                    ["default", settings.hide_eol ? "Не показывать" : "Показывать"],
                    settings.hide_eol ? ["include", "Показывать"] : ["hide", "Не показывать"],
                    ["only", "Только снятые"],
                  ].map(([v, label]) => (
                    <Field key={v} orientation="horizontal" className="py-1">
                      <RadioGroupItem id={`eol-${v}`} value={v} />
                      <FieldLabel htmlFor={`eol-${v}`} className="font-normal">
                        {label}
                      </FieldLabel>
                    </Field>
                  ))}
                </RadioGroup>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </ScrollArea>
        <SheetFooter className="flex-row border-t">
          <Button variant="outline" className="flex-1" size="lg" disabled={!activeCount} onClick={onReset}>
            Сбросить
          </Button>
          <Button className="flex-1" size="lg" onClick={() => onOpenChange(false)}>
            Показать {formatNumber(total)} {plural(total, "товар", "товара", "товаров")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Toolbar: price + the two most relevant facets + "all filters" sheet. */
export function FilterBar({
  facets,
  state,
  update,
  toggleIn,
  activeCount,
  total,
  onReset,
  locked = [],
}: {
  facets: Facets | null;
  state: CatalogState;
  update: Update;
  toggleIn: (k: ListKey, v: string) => void;
  activeCount: number;
  total: number;
  onReset: () => void;
  /** filters already fixed by the section (e.g. kind on "СКУД") — not worth a toolbar button */
  locked?: ListKey[];
}) {
  const { settings } = useConfig();
  const [open, setOpen] = useState(false);
  const primary = FACET_ORDER.filter(
    (k) => !locked.includes(k) && (facetOptions(facets, k).length > 1 || state[k].length),
  ).slice(0, 2);

  return (
    <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <Button variant="outline" className="shrink-0" onClick={() => setOpen(true)}>
        <SlidersHorizontal data-icon="inline-start" />
        Фильтры
        {activeCount ? <Badge className="h-5 min-w-5 px-1.5 tabular-nums">{activeCount}</Badge> : null}
      </Button>
      {settings.show_prices ? <PricePopover facets={facets} state={state} update={update} /> : null}
      {primary.map((k) => (
        <FacetPopover
          key={k}
          title={FACET_TITLES[k]}
          options={facetOptions(facets, k)}
          selected={state[k]}
          onToggle={(v) => toggleIn(k, v)}
          onClear={() => update({ [k]: [] } as Partial<CatalogState>)}
        />
      ))}
      <FiltersSheet
        open={open}
        onOpenChange={setOpen}
        facets={facets}
        state={state}
        update={update}
        toggleIn={toggleIn}
        total={total}
        activeCount={activeCount}
        onReset={onReset}
      />
    </div>
  );
}
