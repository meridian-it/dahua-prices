"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ImportStats = {
  rows: number;
  created: number;
  updated: number;
  unchanged: number;
  price_up: number;
  price_down: number;
  reactivated: number;
  deactivated: number;
  duplicates: number;
  categories: number;
  categories_created: number;
  skipped_sheets: string[];
  warnings: string[];
  price_changes: { model: string; old: number; new: number }[];
  new_models: string[];
  duration_sec: number;
};

export function ImportStatsView({ s }: { s: ImportStats }) {
  const cards = [
    { label: "Строк в файле", value: s.rows },
    { label: "Новых товаров", value: s.created, tone: s.created ? "text-success" : "" },
    { label: "Обновлено", value: s.updated },
    { label: "Без изменений", value: s.unchanged },
    { label: "Цена выросла", value: s.price_up, tone: s.price_up ? "text-destructive" : "" },
    { label: "Цена снизилась", value: s.price_down, tone: s.price_down ? "text-success" : "" },
    { label: "Скрыто (нет в файле)", value: s.deactivated, tone: s.deactivated ? "text-warning" : "" },
    { label: "Категорий", value: s.categories },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} size="sm" className="gap-1 bg-muted/40 ring-0">
            <CardContent>
              <div className={cn("text-xl font-semibold tabular-nums", c.tone)}>{formatNumber(c.value)}</div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Tabs defaultValue={s.price_changes.length ? "prices" : s.new_models.length ? "new" : "info"}>
        <TabsList>
          <TabsTrigger value="prices">Изменения цен · {s.price_changes.length}</TabsTrigger>
          <TabsTrigger value="new">Новые модели · {s.new_models.length}</TabsTrigger>
          <TabsTrigger value="info">Детали</TabsTrigger>
        </TabsList>
        <TabsContent value="prices">
          {s.price_changes.length ? (
            <ScrollArea className="h-72 rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Модель</TableHead>
                    <TableHead className="text-right">Было</TableHead>
                    <TableHead className="text-right">Стало</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.price_changes.map((c) => {
                    const diff = c.new - c.old;
                    const pct = c.old ? (diff / c.old) * 100 : 0;
                    return (
                      <TableRow key={c.model}>
                        <TableCell className="font-medium">{c.model}</TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">{formatNumber(c.old)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(c.new)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", diff > 0 ? "text-destructive" : "text-success")}>
                          <span className="inline-flex items-center gap-0.5">
                            {diff > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                            {Math.abs(pct).toFixed(1)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">Цены не изменились.</p>
          )}
        </TabsContent>
        <TabsContent value="new">
          {s.new_models.length ? (
            <ScrollArea className="h-72">
              <div className="flex flex-wrap gap-1.5">
                {s.new_models.map((m) => (
                  <Badge key={m} variant="secondary">
                    {m}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">Новых моделей нет.</p>
          )}
        </TabsContent>
        <TabsContent value="info">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="text-muted-foreground">Пропущенные листы</TableCell>
                <TableCell className="whitespace-normal">{s.skipped_sheets.join(", ") || "—"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Дубликаты моделей в файле</TableCell>
                <TableCell>{s.duplicates} (взята первая строка)</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Новых категорий</TableCell>
                <TableCell>{s.categories_created}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Вернулись в продажу</TableCell>
                <TableCell>{s.reactivated}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Время обработки</TableCell>
                <TableCell>{s.duration_sec} с</TableCell>
              </TableRow>
              {s.warnings.map((w) => (
                <TableRow key={w}>
                  <TableCell className="text-warning" colSpan={2}>
                    {w}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
