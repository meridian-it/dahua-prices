"use client";

import { CircleCheck, FileSpreadsheet, FlaskConical, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PageHeader } from "@/components/admin/admin-shell";
import { type ImportStats, ImportStatsView } from "@/components/admin/import-stats";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminFetch, adminJSON } from "@/lib/admin-api";
import { parseError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

type ImportRow = { id: number; filename: string; status: string; created_at: string; stats: ImportStats; error: string | null };

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<"dry" | "real" | null>(null);
  const [result, setResult] = useState<{ dry: boolean; stats: ImportStats } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportRow[] | null>(null);
  const [opened, setOpened] = useState<ImportRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(() => {
    adminJSON<ImportRow[]>("/api/admin/imports").then(setHistory).catch(() => setHistory([]));
  }, []);
  useEffect(loadHistory, [loadHistory]);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (!/\.xls[xm]$/i.test(f.name)) {
      notify("Нужен файл Excel (.xlsx)", "warning");
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
  };

  const run = async (dry: boolean) => {
    if (!file) return;
    setBusy(dry ? "dry" : "real");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dry_run", String(dry));
      const res = await adminFetch("/api/admin/imports", { method: "POST", body: fd });
      if (!res.ok) throw await parseError(res);
      const data = (await res.json()) as { stats: ImportStats };
      setResult({ dry, stats: data.stats });
      if (!dry) {
        notify("Прайс загружен в каталог");
        setFile(null);
        loadHistory();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Импорт прайса" description="Товары обновляются по модели, история цен сохраняется, ничего не удаляется." />

      <Card>
        <CardHeader>
          <CardTitle>Новый файл</CardTitle>
          <CardDescription>Правила разбора листов и колонок — в «Настройки → Импорт».</CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
              drag ? "border-primary bg-primary/5" : "hover:border-foreground/25 hover:bg-muted/50",
            )}
          >
            <input ref={inputRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            {file ? (
              <>
                <FileSpreadsheet className="size-10 text-success" strokeWidth={1.5} />
                <div className="font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} МБ · нажмите, чтобы выбрать другой</div>
              </>
            ) : (
              <>
                <Upload className="size-10 text-muted-foreground" strokeWidth={1.5} />
                <div className="font-medium">Перетащите Excel сюда или нажмите для выбора</div>
                <div className="text-xs text-muted-foreground">.xlsx · канальный прайс-лист Dahua</div>
              </>
            )}
          </button>
          {error ? (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Не получилось</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <Button variant="outline" size="lg" disabled={!file || !!busy} onClick={() => run(true)}>
            {busy === "dry" ? <Spinner data-icon="inline-start" /> : <FlaskConical data-icon="inline-start" />}
            Проверить без сохранения
          </Button>
          <Button size="lg" disabled={!file || !!busy} onClick={() => run(false)}>
            {busy === "real" ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
            Загрузить в каталог
          </Button>
          {file ? (
            <Button variant="ghost" size="lg" onClick={() => setFile(null)}>
              <X data-icon="inline-start" /> Отмена
            </Button>
          ) : null}
        </CardFooter>
      </Card>

      {result ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.dry ? <FlaskConical className="size-4 text-primary" /> : <CircleCheck className="size-4 text-success" />}
              {result.dry ? "Предпросмотр — изменения не сохранены" : "Каталог обновлён"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ImportStatsView s={result.stats} />
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>История</CardTitle>
          <CardDescription>Нажмите на строку, чтобы посмотреть детали</CardDescription>
        </CardHeader>
        <CardContent>
          {history === null ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : history.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Файл</TableHead>
                  <TableHead className="text-right">Итог</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id} className="cursor-pointer" onClick={() => setOpened(h)}>
                    <TableCell className="text-muted-foreground">{formatDateTime(h.created_at)}</TableCell>
                    <TableCell className="max-w-xs truncate">{h.filename}</TableCell>
                    <TableCell className="text-right">
                      {h.status === "done" ? (
                        <span className="inline-flex flex-wrap justify-end gap-1">
                          <Badge variant="secondary">+{h.stats.created}</Badge>
                          <Badge variant="secondary">↻ {h.stats.updated}</Badge>
                          {h.stats.price_up ? <Badge variant="destructive">↑ {h.stats.price_up}</Badge> : null}
                          {h.stats.price_down ? <Badge className="bg-success/15 text-success">↓ {h.stats.price_down}</Badge> : null}
                        </span>
                      ) : (
                        <Badge variant="destructive">ошибка</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileSpreadsheet />
                </EmptyMedia>
                <EmptyTitle>Пока пусто</EmptyTitle>
                <EmptyDescription>Здесь появятся загрузки прайса.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!opened} onOpenChange={(o) => !o && setOpened(null)}>
        <SheetContent className="w-full data-[side=right]:sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{opened?.filename}</SheetTitle>
            <SheetDescription>{opened ? formatDateTime(opened.created_at) : ""}</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-6">
            {opened?.status === "done" ? (
              <ImportStatsView s={opened.stats} />
            ) : (
              <Alert variant="destructive">
                <AlertDescription>{opened?.error}</AlertDescription>
              </Alert>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
