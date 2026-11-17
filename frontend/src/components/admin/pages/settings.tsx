"use client";

import { RotateCcw, Save, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, adminJSON } from "@/lib/admin-api";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

type SchemaItem = {
  key: string;
  group: string;
  label: string;
  type: "string" | "text" | "number" | "bool" | "color" | "list" | "json" | "select";
  default: unknown;
  options?: string[];
  rows?: number;
  public?: boolean;
};
type Payload = { schema: SchemaItem[]; values: Record<string, unknown> };

const OPTION_LABELS: Record<string, string> = { grid: "Карточки", table: "Таблица" };

function toDraft(item: SchemaItem, v: unknown): unknown {
  if (item.type === "list") return ((v as string[]) ?? []).join("\n");
  if (item.type === "json") return JSON.stringify(v, null, 2);
  return v;
}

function SettingControl({ s, value, set }: { s: SchemaItem; value: unknown; set: (v: unknown) => void }) {
  switch (s.type) {
    case "bool":
      return <Switch id={s.key} checked={Boolean(value)} onCheckedChange={set} />;
    case "select": {
      const items = Object.fromEntries((s.options ?? []).map((o) => [o, OPTION_LABELS[o] ?? o]));
      return (
        <Select items={items} value={String(value)} onValueChange={(v) => set(v)}>
          <SelectTrigger id={s.key} className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {s.options?.map((o) => (
              <SelectItem key={o} value={o}>
                {OPTION_LABELS[o] ?? o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "color":
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={String(value)}
            onChange={(e) => set(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded-md border bg-transparent p-0.5"
            aria-label={s.label}
          />
          <Input id={s.key} className="w-32 font-mono" value={String(value)} onChange={(e) => set(e.target.value)} />
        </div>
      );
    case "number":
      return <Input id={s.key} inputMode="decimal" className="w-full sm:w-40" value={String(value ?? "")} onChange={(e) => set(e.target.value)} />;
    case "text":
    case "json":
    case "list":
      return (
        <Textarea
          id={s.key}
          rows={s.rows ?? (s.type === "json" ? 14 : s.type === "list" ? 4 : 3)}
          className={cn((s.type === "json" || s.key === "search_synonyms") && "font-mono text-xs")}
          value={String(value ?? "")}
          onChange={(e) => set(e.target.value)}
          placeholder={s.type === "list" ? "По одному значению в строке" : undefined}
        />
      );
    default:
      return <Input id={s.key} className="w-full @md/field-group:w-96" value={String(value ?? "")} onChange={(e) => set(e.target.value)} />;
  }
}

export default function SettingsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  const init = (p: Payload) => {
    setData(p);
    setDraft(Object.fromEntries(p.schema.map((s) => [s.key, toDraft(s, p.values[s.key])])));
  };
  useEffect(() => {
    adminJSON<Payload>("/api/admin/settings").then(init);
  }, []);

  const groups = useMemo(() => [...new Set(data?.schema.map((s) => s.group) ?? [])], [data]);
  const dirty = useMemo(
    () => (data ? data.schema.filter((s) => JSON.stringify(draft[s.key]) !== JSON.stringify(toDraft(s, data.values[s.key]))).map((s) => s.key) : []),
    [draft, data],
  );

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const body = Object.fromEntries(dirty.map((k) => [k, draft[k]]));
      init(await adminJSON<Payload>("/api/admin/settings", { method: "PUT", body: JSON.stringify(body) }));
      notify("Настройки сохранены", "success", "Изменения уже на сайте");
    } catch (e) {
      if (e instanceof ApiError && e.detail && typeof e.detail === "object" && "errors" in e.detail) {
        setErrors((e.detail as { errors: Record<string, string> }).errors);
      }
      notify(e instanceof Error ? e.message : "Ошибка", "error");
    } finally {
      setBusy(false);
    }
  };

  const reindex = async () => {
    setReindexing(true);
    try {
      const r = await adminJSON<{ reindexed: number }>("/api/admin/reindex", { method: "POST" });
      notify(`Переиндексировано товаров: ${r.reindexed}`);
    } finally {
      setReindexing(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Настройки"
        description="Всё, что не является секретом, настраивается здесь и применяется сразу."
        actions={
          <div className="flex items-center gap-2">
            {dirty.length ? (
              <Button variant="ghost" size="lg" onClick={() => data && init(data)}>
                Отменить
              </Button>
            ) : null}
            <Button size="lg" disabled={!dirty.length || busy} onClick={save}>
              {busy ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              Сохранить{dirty.length ? ` (${dirty.length})` : ""}
            </Button>
          </div>
        }
      />

      {!data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <Tabs defaultValue={groups[0]} className="gap-4">
          <TabsList className="h-9! w-full justify-start overflow-x-auto sm:w-fit">
            {groups.map((g) => {
              const changed = data.schema.some((s) => s.group === g && dirty.includes(s.key));
              return (
                <TabsTrigger key={g} value={g} className="px-3">
                  {g}
                  {changed ? <span className="size-1.5 rounded-full bg-primary" /> : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {groups.map((g) => (
            <TabsContent key={g} value={g} className="flex flex-col gap-4">
              <Card>
                <CardContent>
                  <FieldGroup>
                    {data.schema
                      .filter((s) => s.group === g)
                      .map((s, i) => {
                        const v = draft[s.key];
                        const isDefault = JSON.stringify(v) === JSON.stringify(toDraft(s, s.default));
                        const set = (nv: unknown) => setDraft((d) => ({ ...d, [s.key]: nv }));
                        const wide = s.type === "text" || s.type === "json" || s.type === "list";
                        return (
                          <div key={s.key} className="contents">
                            {i ? <FieldSeparator /> : null}
                            <Field orientation={wide ? "vertical" : "responsive"} data-invalid={!!errors[s.key]}>
                              <FieldContent>
                                <FieldLabel htmlFor={s.key}>{s.label}</FieldLabel>
                                <FieldDescription className="flex flex-wrap items-center gap-1.5">
                                  <code className="text-xs">{s.key}</code>
                                  {s.public ? <Badge variant="outline">на сайте</Badge> : null}
                                  {!isDefault ? (
                                    <Button variant="link" size="xs" className="h-auto p-0" onClick={() => set(toDraft(s, s.default))}>
                                      <RotateCcw /> по умолчанию
                                    </Button>
                                  ) : null}
                                </FieldDescription>
                                {errors[s.key] ? <FieldError>{errors[s.key]}</FieldError> : null}
                              </FieldContent>
                              <SettingControl s={s} value={v} set={set} />
                            </Field>
                          </div>
                        );
                      })}
                  </FieldGroup>
                </CardContent>
              </Card>
              {g === "Поиск" || g === "Импорт" ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Переиндексация каталога</CardTitle>
                    <CardDescription>Заново распознать характеристики и обновить поисковый индекс всех товаров.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" onClick={reindex} disabled={reindexing}>
                      {reindexing ? <Spinner data-icon="inline-start" /> : <WandSparkles data-icon="inline-start" />}
                      Переиндексировать
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </>
  );
}
