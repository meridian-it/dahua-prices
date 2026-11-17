"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminJSON } from "@/lib/admin-api";
import { notify } from "@/lib/notify";

type Cat = { id: number; name: string; source_name: string; slug: string; sort_order: number; is_visible: boolean; count: number };

export default function CategoriesPage() {
  const [cats, setCats] = useState<Cat[] | null>(null);
  const load = () => adminJSON<Cat[]>("/api/admin/categories").then(setCats);
  useEffect(() => {
    load();
  }, []);

  const patch = async (id: number, body: Partial<Cat>, msg?: string) => {
    setCats((cs) => cs?.map((c) => (c.id === id ? { ...c, ...body } : c)) ?? cs);
    try {
      await adminJSON(`/api/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (msg) notify(msg);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Ошибка", "error");
      load();
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (!cats) return;
    const j = index + dir;
    if (j < 0 || j >= cats.length) return;
    const next = [...cats];
    [next[index], next[j]] = [next[j], next[index]];
    setCats(next.map((c, i) => ({ ...c, sort_order: i })));
    await Promise.all(
      next.map((c, i) => (c.sort_order !== i ? adminJSON(`/api/admin/categories/${c.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: i }) }) : null)),
    );
  };

  return (
    <>
      <PageHeader title="Категории" description="Создаются из листов Excel. Переименование, порядок и видимость сохраняются между импортами." />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24 pl-4">Порядок</TableHead>
              <TableHead>Название на сайте</TableHead>
              <TableHead className="w-24 text-right">Товаров</TableHead>
              <TableHead className="w-24 pr-4 text-right">Видна</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!cats
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : cats.map((c, i) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4">
                      <ButtonGroup>
                        <Button variant="outline" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
                          <ArrowUp />
                        </Button>
                        <Button variant="outline" size="icon-sm" disabled={i === cats.length - 1} onClick={() => move(i, 1)} aria-label="Ниже">
                          <ArrowDown />
                        </Button>
                      </ButtonGroup>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="max-w-md"
                        defaultValue={c.name}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== c.name) patch(c.id, { name: v }, "Название сохранено");
                        }}
                      />
                      {c.source_name !== c.name ? <div className="mt-1 text-xs text-muted-foreground">Лист в Excel: {c.source_name}</div> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{c.count}</Badge>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Switch checked={c.is_visible} onCheckedChange={(v) => patch(c.id, { is_visible: v }, v ? "Категория показана" : "Категория скрыта")} />
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
