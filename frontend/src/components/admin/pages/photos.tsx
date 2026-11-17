"use client";

import { CircleCheck, CircleHelp, ImageOff, Images, Play, RefreshCw, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/admin/admin-shell";
import { ProductImage } from "@/components/product/bits";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminJSON } from "@/lib/admin-api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { notify } from "@/lib/notify";

import { type AdminProduct, Editor } from "./products";

type Job = {
  id: number;
  status: "running" | "cancelling" | "done" | "cancelled" | "failed" | "interrupted";
  params: { mode: string };
  total: number;
  processed: number;
  stats: Record<string, number>;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};
type Status = { counts: Record<string, number>; with_photo: number; total: number; job: Job | null; running: boolean };

const JOB_STATUS: Record<Job["status"], string> = {
  running: "идёт",
  cancelling: "останавливается",
  done: "завершён",
  cancelled: "остановлен",
  failed: "ошибка",
  interrupted: "прерван (перезапуск сервера)",
};

const TABS = [
  { value: "close", label: "Проверить", hint: "Найдено близкое совпадение — убедитесь, что фото подходит" },
  { value: "not_found", label: "Не найдено", hint: "Модели нет ни в одном источнике — добавьте фото вручную" },
  { value: "error", label: "Ошибки", hint: "Не удалось связаться с источником — повторится при следующем запуске" },
  { value: "missing", label: "Все без фото", hint: "Товары без фото по любой причине" },
  { value: "found", label: "Найдено", hint: "Фото с dahuasecurity.com или из каталога Icecat" },
];

function JobCard({ s, onStart, onCancel, busy }: { s: Status; onStart: (mode: string) => void; onCancel: () => void; busy: boolean }) {
  const job = s.job;
  const running = s.running && job;
  const pct = job && job.total ? Math.round((job.processed / job.total) * 100) : 0;
  const unchecked = (s.counts.unchecked ?? 0) + (s.counts.error ?? 0);
  const missing = s.total - s.with_photo;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Автоподбор фото</CardTitle>
        <CardDescription>
          Ищем модель на dahuasecurity.com, а если её там нет (региональные модели) — в каталоге Icecat. Порядок источников
          задаётся в настройках. При обрыве связи подбор ставится на паузу и продолжается сам; новые товары и ошибки
          обрабатываются автоматически после импорта и при запуске сервера.
        </CardDescription>
        <CardAction>
          {running ? (
            <Button variant="outline" onClick={onCancel} disabled={busy || job.status === "cancelling"}>
              <Square data-icon="inline-start" /> Остановить
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {running ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Spinner /> {job.stats.offline ? "Нет связи с источниками, ждём… " : null}Обработано {formatNumber(job.processed)} из {formatNumber(job.total)}
              </span>
              <span className="text-muted-foreground tabular-nums">{pct}%</span>
            </div>
            <Progress value={pct} />
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Badge variant="secondary">найдено {job.stats.found ?? 0}</Badge>
              {job.stats.close ? <Badge variant="outline">близких {job.stats.close}</Badge> : null}
              <Badge variant="outline">не найдено {job.stats.not_found ?? 0}</Badge>
              {job.stats.error ? <Badge variant="destructive">ошибок {job.stats.error}</Badge> : null}
            </div>
          </div>
        ) : (
          <>
            {job ? (
              <p className="text-sm text-muted-foreground">
                Последний запуск {formatDateTime(job.started_at)} — {JOB_STATUS[job.status]}: найдено {job.stats.found ?? 0}
                {job.stats.close ? `, близких ${job.stats.close}` : ""}, не найдено {job.stats.not_found ?? 0}
                {job.stats.error ? `, ошибок ${job.stats.error}` : ""}.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onStart("missing")} disabled={busy || !unchecked}>
                <Play data-icon="inline-start" /> Подобрать для новых и с ошибкой{unchecked ? ` · ${formatNumber(unchecked)}` : ""}
              </Button>
              <Button variant="outline" onClick={() => onStart("retry")} disabled={busy || !missing}>
                <RefreshCw data-icon="inline-start" /> Повторить для всех без фото{missing ? ` · ${formatNumber(missing)}` : ""}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="ghost" disabled={busy} />}>Обновить все</AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Обновить фото у всех товаров?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Фото, найденные автоматически, будут загружены заново. Фото, заданные вручную, не изменятся. Займёт несколько минут.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onStart("all")}>Обновить</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Review({ tab, version, onOpen }: { tab: string; version: number; onOpen: (id: number) => void }) {
  const [items, setItems] = useState<AdminProduct[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  useEffect(() => {
    const ctrl = new AbortController();
    adminJSON<{ total: number; items: AdminProduct[] }>(`/api/admin/photos/review?status=${tab}&page=${page}&page_size=48`, {
      signal: ctrl.signal,
    })
      .then((d) => {
        setTotal(d.total);
        setItems((prev) => (page === 1 || !prev ? d.items : [...prev, ...d.items]));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [tab, page, version]);

  if (!items) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleCheck />
          </EmptyMedia>
          <EmptyTitle>Здесь пусто</EmptyTitle>
          <EmptyDescription>Нет товаров в этой группе.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-shadow hover:shadow-md"
          >
            <ProductImage src={p.image_url} alt={p.model} kind={p.kind} form={p.form_factor} className="aspect-[4/3] w-full" />
            <div className="flex flex-col gap-0.5 border-t p-3">
              <span className="truncate text-sm font-medium">{p.model}</span>
              <span className="truncate text-xs text-muted-foreground">
                {p.photo_meta.status === "close" && p.photo_meta.matched ? `≈ ${p.photo_meta.matched}` : p.title}
              </span>
            </div>
          </button>
        ))}
      </div>
      {items.length < total ? (
        <Button variant="outline" className="self-center" onClick={() => setPage(page + 1)}>
          Показать ещё {formatNumber(total - items.length)}
        </Button>
      ) : null}
    </div>
  );
}

export default function PhotosPage() {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("close");
  const [editing, setEditing] = useState<number | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(() => adminJSON<Status>("/api/admin/photos").then(setS).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);
  // poll while a job runs; refresh the lists when it finishes
  useEffect(() => {
    if (!s?.running) return;
    const t = setInterval(load, 2000);
    return () => {
      clearInterval(t);
      setVersion((v) => v + 1);
    };
  }, [s?.running, load]);

  const start = async (mode: string) => {
    setBusy(true);
    try {
      await adminJSON("/api/admin/photos/jobs", { method: "POST", body: JSON.stringify({ mode }) });
      notify("Подбор фото запущен", "success");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Ошибка", "error");
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    try {
      await adminJSON("/api/admin/photos/jobs/cancel", { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const c = s?.counts ?? {};
  const stats = s
    ? [
        { label: "С фото", value: s.with_photo, icon: Images, of: s.total },
        { label: "Проверить", value: c.close ?? 0, icon: CircleHelp },
        { label: "Не найдено", value: c.not_found ?? 0, icon: ImageOff },
        { label: "Не проверено / ошибка", value: (c.unchecked ?? 0) + (c.error ?? 0), icon: RefreshCw },
      ]
    : [];

  return (
    <>
      <PageHeader title="Фото" description="Фото подбираются по модели автоматически: dahuasecurity.com, затем каталог Icecat" />
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {s
            ? stats.map((x) => (
                <Card key={x.label} size="sm">
                  <CardHeader>
                    <CardDescription className="flex items-center gap-2">
                      <x.icon className="size-4" /> {x.label}
                    </CardDescription>
                    <CardTitle className="text-2xl tabular-nums">
                      {formatNumber(x.value)}
                      {"of" in x && x.of ? <span className="ml-1.5 text-sm font-normal text-muted-foreground">из {formatNumber(x.of)}</span> : null}
                    </CardTitle>
                  </CardHeader>
                </Card>
              ))
            : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>

        {s ? <JobCard s={s} onStart={start} onCancel={cancel} busy={busy} /> : <Skeleton className="h-40 rounded-xl" />}

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
              <TabsList>
                {TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <span className="text-sm text-muted-foreground">{TABS.find((t) => t.value === tab)?.hint}</span>
          </div>
          <Review tab={tab} version={version} onOpen={setEditing} />
        </div>
      </div>

      <Editor id={editing} onClose={() => setEditing(null)} onSaved={() => setVersion((v) => v + 1)} />
    </>
  );
}
