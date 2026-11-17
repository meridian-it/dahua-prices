"use client";

import { ArrowRight, Check, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useConfig } from "@/components/config-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatPrice, productHref, warrantyText } from "@/lib/format";
import { closeQuickView, openQuickView } from "@/lib/quick-view";
import type { ProductFull } from "@/lib/types";

import { CompareToggle, CopyButton, Price, StatusBadges } from "./bits";

export function ProductSummary({ p, actions }: { p: ProductFull; actions?: React.ReactNode }) {
  const { settings } = useConfig();
  const [allVariants, setAllVariants] = useState(false);
  const variants = p.siblings ?? [];
  const meta = [
    p.warranty_months ? `Гарантия ${warrantyText(p.warranty_months)}` : null,
    p.mpq_raw ? `В упаковке ${p.mpq ?? p.mpq_raw} шт.` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <StatusBadges p={p} />
        <div className="flex items-start gap-1">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{p.model}</h1>
          <CopyButton value={p.model} className="mt-1 shrink-0" />
        </div>
        <p className="text-muted-foreground">{p.title}</p>
      </div>

      {p.is_eol ? (
        <Alert className="border-warning/40 bg-warning/10">
          <TriangleAlert className="text-warning" />
          <AlertTitle>Снят с производства</AlertTitle>
          {p.replacement || (p.note && p.note !== "EOL") ? (
            <AlertDescription>
              {p.replacement ? (
                <Button variant="link" className="h-auto px-0" onClick={() => openQuickView(p.replacement!.model)}>
                  Замена: {p.replacement.model} <ArrowRight data-icon="inline-end" />
                </Button>
              ) : (
                <p>{p.note}</p>
              )}
            </AlertDescription>
          ) : null}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4">
        {settings.show_prices ? (
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <Price p={p} size="lg" />
            {p.price !== null ? <span className="pb-1 text-sm text-muted-foreground">{settings.price_label}</span> : null}
          </div>
        ) : null}
        {meta.length ? <p className="text-sm text-muted-foreground">{meta.join(" · ")}</p> : null}
        <div className="flex flex-wrap gap-2">
          <CompareToggle model={p.model} variant="full" />
          {actions}
        </div>
      </div>

      {variants.length ? (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Другие варианты</div>
          <div className="flex flex-wrap gap-1.5">
            {variants.slice(0, allVariants ? undefined : 6).map((s) => (
              <Button key={s.model} variant="outline" size="sm" title={s.title} onClick={() => openQuickView(s.model)} className="font-normal">
                {s.model}
                {s.price !== null && settings.show_prices ? <span className="text-muted-foreground">{formatPrice(s.price, settings)}</span> : null}
              </Button>
            ))}
            {variants.length > 6 && !allVariants ? (
              <Button variant="ghost" size="sm" onClick={() => setAllVariants(true)}>
                ещё {variants.length - 6}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ProductTabs({ p }: { p: ProductFull }) {
  const description = p.description.split("\n").slice(1).join("\n").trim();
  return (
    <Tabs defaultValue="specs" className="gap-4">
      <TabsList variant="line" className="w-full justify-start">
        <TabsTrigger value="specs">Характеристики</TabsTrigger>
        <TabsTrigger value="features">Возможности{p.feature_labels.length ? ` · ${p.feature_labels.length}` : ""}</TabsTrigger>
        {description ? <TabsTrigger value="desc">Описание</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="specs">
        {p.specs.length ? (
          <Table>
            <TableBody>
              {p.specs.map((s) => (
                <TableRow key={s.key}>
                  <TableCell className="w-1/2 text-muted-foreground">{s.label}</TableCell>
                  <TableCell className="font-medium whitespace-normal">{String(s.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">Характеристики не распознаны — смотрите вкладку «Описание».</p>
        )}
      </TabsContent>
      <TabsContent value="features">
        {p.feature_labels.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {p.feature_labels.map((f) => (
              <li key={f.key} className="flex items-center gap-2.5 text-sm">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {f.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Нет данных.</p>
        )}
      </TabsContent>
      {description ? (
        <TabsContent value="desc">
          <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{description}</p>
          {p.updated_at ? (
            <>
              <Separator className="my-4" />
              <p className="text-xs text-muted-foreground">Данные из прайс-листа от {formatDate(p.updated_at)}</p>
            </>
          ) : null}
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

export function OpenPageButton({ model }: { model: string }) {
  return (
    <Button variant="ghost" size="lg" nativeButton={false} render={<Link href={productHref(model)} onClick={() => closeQuickView()} />}>
      Страница товара <ArrowRight data-icon="inline-end" />
    </Button>
  );
}
