"use client";

import { ArrowRight, Cctv, FileSpreadsheet, ImageOff, Package, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminJSON } from "@/lib/admin-api";
import { formatDateTime, formatNumber } from "@/lib/format";

type Stats = {
  products: number;
  inactive: number;
  hidden: number;
  new: number;
  eol: number;
  cameras: number;
  without_photo: number;
  without_price: number;
  categories: number;
  last_imports: { id: number; filename: string; status: string; created_at: string; stats: Record<string, number> }[];
};

export default function DashboardPage() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    adminJSON<Stats>("/api/admin/stats").then(setS).catch(() => {});
  }, []);

  const cards = s
    ? [
        { label: "Товаров в каталоге", value: s.products, icon: Package, hint: `${s.categories} категорий` },
        { label: "Камер", value: s.cameras, icon: Cctv, hint: "IP, HDCVI, PTZ" },
        { label: "Новинок", value: s.new, icon: Sparkles, hint: "по меткам в прайсе" },
        { label: "Снято с производства", value: s.eol, icon: TriangleAlert, hint: "EOL" },
        { label: "Без фото", value: s.without_photo, icon: ImageOff, hint: "см. раздел «Фото»" },
        { label: "Цена по запросу", value: s.without_price, icon: Package, hint: "без РРЦ" },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Обзор"
        description="Состояние каталога и последние загрузки прайса"
        actions={
          <Button size="lg" nativeButton={false} render={<Link href="/admin/import" />}>
            <FileSpreadsheet data-icon="inline-start" /> Загрузить прайс
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {s
          ? cards.map((c) => (
              <Card key={c.label}>
                <CardHeader>
                  <CardDescription>{c.label}</CardDescription>
                  <CardTitle className="text-3xl font-semibold tabular-nums">{formatNumber(c.value)}</CardTitle>
                  <CardAction>
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <c.icon className="size-4.5" />
                    </div>
                  </CardAction>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">{c.hint}</CardContent>
              </Card>
            ))
          : Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Последние импорты</CardTitle>
          <CardDescription>История загрузок Excel</CardDescription>
          <CardAction>
            <Button variant="ghost" nativeButton={false} render={<Link href="/admin/import" />}>
              Все <ArrowRight data-icon="inline-end" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {s?.last_imports.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Файл</TableHead>
                  <TableHead className="text-right">Результат</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.last_imports.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-muted-foreground">{formatDateTime(i.created_at)}</TableCell>
                    <TableCell className="max-w-xs truncate">{i.filename}</TableCell>
                    <TableCell className="text-right">
                      {i.status === "done" ? (
                        <span className="inline-flex gap-1">
                          <Badge variant="secondary">+{i.stats.created ?? 0}</Badge>
                          <Badge variant="secondary">обновлено {i.stats.updated ?? 0}</Badge>
                        </span>
                      ) : (
                        <Badge variant="destructive">{i.status}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Импортов пока не было</EmptyTitle>
                <EmptyDescription>Загрузите Excel-прайс на странице импорта.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </>
  );
}
