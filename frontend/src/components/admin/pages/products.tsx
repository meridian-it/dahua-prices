"use client";

import { ChevronLeft, ChevronRight, ExternalLink, EyeOff, ImageDown, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/admin/admin-shell";
import { ProductImage } from "@/components/product/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { adminJSON } from "@/lib/admin-api";
import { formatNumber, productHref } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { ProductBrief, ProductFull } from "@/lib/types";
import { cn } from "@/lib/utils";

type AdminItem = ProductBrief & { is_active: boolean; is_hidden: boolean; base_price: number | null };
type AdminList = { items: AdminItem[]; total: number; pages: number };
export type PhotoMeta = {
  status?: "found" | "close" | "not_found" | "error" | "manual";
  source?: string;
  tried?: string[];
  matched?: string;
  page_url?: string;
  checked_at?: string;
  error?: string;
};
export type AdminProduct = ProductFull & { is_active: boolean; is_hidden: boolean; photo_meta: PhotoMeta };

export const PHOTO_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  found: { label: "Найдено", variant: "secondary" },
  close: { label: "Близкое совпадение — проверьте", variant: "outline" },
  not_found: { label: "Не найдено в источниках", variant: "outline" },
  error: { label: "Ошибка загрузки — повторится автоматически", variant: "destructive" },
  manual: { label: "Задано вручную", variant: "secondary" },
};

export const PHOTO_SOURCE: Record<string, string> = { dahuasecurity: "dahuasecurity.com", icecat: "Icecat" };

export function PhotoStatus({ meta }: { meta: PhotoMeta }) {
  if (!meta.status) return <span className="text-xs text-muted-foreground">Ещё не проверялось</span>;
  const st = PHOTO_STATUS[meta.status];
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Badge variant={st.variant}>{st.label}</Badge>
      {meta.source ? <Badge variant="outline">{PHOTO_SOURCE[meta.source] ?? meta.source}</Badge> : null}
      {meta.status === "not_found" && meta.tried?.length ? <span>искали: {meta.tried.map((s) => PHOTO_SOURCE[s] ?? s).join(", ")}</span> : null}
      {meta.status === "error" && meta.error ? <span className="basis-full">{meta.error}</span> : null}
      {meta.matched ? (
        meta.page_url ? (
          <a href={meta.page_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
            {meta.matched} <ExternalLink className="size-3" />
          </a>
        ) : (
          meta.matched
        )
      ) : null}
    </span>
  );
}

export function Editor({ id, onClose, onSaved }: { id: number | null; onClose: () => void; onSaved: (p: AdminProduct) => void }) {
  const [p, setP] = useState<AdminProduct | null>(null);
  const [title, setTitle] = useState("");
  const [images, setImages] = useState("");
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [origImages, setOrigImages] = useState("");

  useEffect(() => {
    if (id === null) return;
    setP(null);
    adminJSON<AdminProduct>(`/api/admin/products/${id}`).then((d) => {
      setP(d);
      setTitle(d.title);
      const imgs = (d.images.length ? d.images : d.image_url ? [d.image_url] : []).join("\n");
      setImages(imgs);
      setOrigImages(imgs);
      setHidden(d.is_hidden);
    });
  }, [id]);

  const refetch = async () => {
    if (id === null) return;
    setFetching(true);
    try {
      const d = await adminJSON<AdminProduct>(`/api/admin/products/${id}/photos/fetch`, { method: "POST" });
      setP(d);
      const imgs = d.images.join("\n");
      setImages(imgs);
      setOrigImages(imgs);
      onSaved(d);
      const st = d.photo_meta.status;
      notify(st === "found" || st === "close" ? `Фото загружены: ${d.images.length}` : PHOTO_STATUS[st ?? "not_found"].label, st === "found" || st === "close" ? "success" : "warning");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Ошибка", "error");
    } finally {
      setFetching(false);
    }
  };

  const list = images.split("\n").map((s) => s.trim()).filter(Boolean);
  const save = async () => {
    if (id === null) return;
    setBusy(true);
    try {
      const d = await adminJSON<AdminProduct>(`/api/admin/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          is_hidden: hidden,
          // only touching photos marks them as manual (protected from the automatic fetcher)
          ...(images !== origImages ? { images: list, image_url: list[0] ?? null } : {}),
        }),
      });
      onSaved(d);
      notify("Сохранено");
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Ошибка", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{p?.model ?? "Загрузка…"}</SheetTitle>
          <SheetDescription>{p?.title}</SheetDescription>
        </SheetHeader>
        {p ? (
          <div className="flex-1 overflow-y-auto px-4">
            <FieldGroup>
              <ProductImage src={list[0]} alt={p.model} kind={p.kind} form={p.form_factor} hint={!list.length} className="aspect-[16/10] w-full rounded-xl border" />
              {list.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto">
                  {list.map((src) => (
                    <ProductImage key={src} src={src} alt="" className="size-14 shrink-0 rounded-md border" />
                  ))}
                </div>
              ) : null}
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <PhotoStatus meta={p.photo_meta} />
                <Button variant="outline" onClick={refetch} disabled={fetching} className="self-start">
                  {fetching ? <Spinner data-icon="inline-start" /> : <ImageDown data-icon="inline-start" />}
                  Найти фото заново
                </Button>
              </div>
              <Field>
                <FieldLabel htmlFor="images">Фото</FieldLabel>
                <Textarea id="images" rows={4} className="font-mono text-xs" value={images} onChange={(e) => setImages(e.target.value)} placeholder="https://…/photo.jpg" />
                <FieldDescription>Ссылки по одной в строке, первая — основная. Изменённые вручную фото автоподбор не трогает.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="title">Заголовок</FieldLabel>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <FieldDescription>Перезапишется при следующем импорте прайса.</FieldDescription>
              </Field>
              <Field orientation="horizontal" className="rounded-lg border p-3">
                <FieldContent>
                  <FieldLabel htmlFor="hidden">Скрыть с сайта</FieldLabel>
                  <FieldDescription>Сохраняется между импортами.</FieldDescription>
                </FieldContent>
                <Switch id="hidden" checked={hidden} onCheckedChange={setHidden} />
              </Field>
              <div className="rounded-lg border">
                <Table>
                  <TableBody>
                    {p.specs.map((s) => (
                      <TableRow key={s.key}>
                        <TableCell className="text-muted-foreground">{s.label}</TableCell>
                        <TableCell className="whitespace-normal">{String(s.value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </FieldGroup>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        )}
        <SheetFooter className="flex-row">
          <Button className="flex-1" size="lg" onClick={save} disabled={!p || busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null} Сохранить
          </Button>
          {p ? (
            <Button variant="outline" size="icon-lg" nativeButton={false} render={<Link href={productHref(p.model)} target="_blank" />} aria-label="Открыть на сайте">
              <ExternalLink />
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function ProductsPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminList | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      const qs = new URLSearchParams({ q, page: String(page), page_size: "50" });
      adminJSON<AdminList>(`/api/admin/products?${qs}`)
        .then(setData)
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, page]);

  return (
    <>
      <PageHeader title="Товары" description="Фото и видимость. Цены и описания приходят из прайса." />
      <div className="mb-4 flex items-center gap-3">
        <InputGroup className="h-9 flex-1">
          <InputGroupAddon>{loading ? <Spinner /> : <Search />}</InputGroupAddon>
          <InputGroupInput
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Модель или характеристики…"
          />
        </InputGroup>
        {data ? <Badge variant="secondary">{formatNumber(data.total)} шт.</Badge> : null}
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 pl-4" />
              <TableHead>Модель</TableHead>
              <TableHead className="hidden lg:table-cell">Раздел</TableHead>
              <TableHead className="text-right">Цена</TableHead>
              <TableHead className="pr-4 text-right">Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : data.items.map((p) => (
                  <TableRow key={p.id} onClick={() => setEditing(p.id)} className={cn("cursor-pointer", !p.is_active && "opacity-50")}>
                    <TableCell className="pl-4">
                      <ProductImage src={p.image_url} alt="" kind={p.kind} form={p.form_factor} pad="p-0.5" className="size-10 rounded-md" />
                    </TableCell>
                    <TableCell className="max-w-0">
                      <div className="truncate font-medium">{p.model}</div>
                      <div className="truncate text-xs text-muted-foreground">{p.title}</div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{p.category?.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.base_price !== null ? formatNumber(p.base_price) : "—"}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <span className="inline-flex flex-wrap justify-end gap-1">
                        {p.is_hidden ? (
                          <Badge variant="outline">
                            <EyeOff /> скрыт
                          </Badge>
                        ) : null}
                        {!p.is_active ? <Badge variant="outline">нет в прайсе</Badge> : null}
                        {p.is_eol ? <Badge className="bg-warning/15 text-warning">EOL</Badge> : null}
                        {p.is_new ? <Badge className="bg-success/15 text-success">new</Badge> : null}
                        {p.image_url ? <Badge variant="secondary">фото</Badge> : null}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
        {data && data.pages > 1 ? (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft data-icon="inline-start" /> Назад
            </Button>
            <span className="text-muted-foreground">
              Страница {page} из {data.pages}
            </span>
            <Button variant="outline" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
              Вперёд <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        ) : null}
      </Card>

      <Editor
        id={editing}
        onClose={() => setEditing(null)}
        onSaved={(p) =>
          setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === p.id ? { ...i, image_url: p.image_url, title: p.title, is_hidden: p.is_hidden } : i)) } : d))
        }
      />
    </>
  );
}
