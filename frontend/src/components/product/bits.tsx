"use client";

import { Check, Copy, GitCompareArrows, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";

import { useConfig } from "@/components/config-provider";
import { DeviceArt } from "@/components/device-art";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCompare } from "@/lib/compare-store";
import { formatPrice } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { ProductBrief } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Photo slot: real photo once `image_url` is set (filled later by the photo parser), otherwise a device illustration. */
export function ProductImage({
  src,
  alt,
  kind,
  form,
  className,
  pad = "p-[12%]",
  hint,
}: {
  src: string | null | undefined;
  alt: string;
  kind?: string | null;
  form?: string | null;
  className?: string;
  pad?: string;
  hint?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <div className={cn("relative overflow-hidden bg-white dark:bg-zinc-200", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" className="size-full object-contain p-[6%]" onError={() => setFailed(true)} />
      </div>
    );
  }
  return (
    <div className={cn("art-bg relative flex items-center justify-center overflow-hidden", className)}>
      <DeviceArt kind={kind} form={form} className={cn("size-full", pad)} />
      {hint ? (
        <Badge variant="outline" className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/70 text-muted-foreground backdrop-blur">
          Фото скоро появится
        </Badge>
      ) : null}
    </div>
  );
}

export function Price({
  p,
  size = "md",
  className,
}: {
  p: Pick<ProductBrief, "price" | "prev_price" | "price_trend">;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { settings } = useConfig();
  if (!settings.show_prices) return null;
  if (p.price === null) {
    return <span className={cn("text-sm text-muted-foreground", className)}>{settings.price_on_request_text}</span>;
  }
  return (
    <span className={cn("inline-flex flex-col leading-tight", className)}>
      <span
        className={cn(
          "font-semibold tracking-tight tabular-nums",
          size === "lg" ? "text-3xl" : size === "md" ? "text-lg" : "text-sm",
        )}
      >
        {formatPrice(p.price, settings)}
      </span>
      {p.price_trend && p.prev_price ? (
        <span className={cn("inline-flex items-center gap-1 text-xs tabular-nums", p.price_trend === "up" ? "text-destructive" : "text-success")}>
          {p.price_trend === "up" ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          <s className="text-muted-foreground">{formatPrice(p.prev_price, settings)}</s>
        </span>
      ) : null}
    </span>
  );
}

export function StatusBadges({ p, className }: { p: Pick<ProductBrief, "is_new" | "is_eol">; className?: string }) {
  if (!p.is_new && !p.is_eol) return null;
  return (
    <span className={cn("inline-flex gap-1", className)}>
      {p.is_new ? <Badge className="bg-success text-white">Новинка</Badge> : null}
      {p.is_eol ? <Badge variant="secondary">Снят с производства</Badge> : null}
    </span>
  );
}

export function CompareToggle({
  model,
  variant = "icon",
  className,
}: {
  model: string;
  variant?: "icon" | "full";
  className?: string;
}) {
  const { settings } = useConfig();
  const { has, toggle, max } = useCompare(settings.compare_max);
  const active = has(model);
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const r = toggle(model);
    if (r === "full") notify(`В сравнении максимум ${max} товаров`, "warning");
    else if (r === "added") notify("Добавлено к сравнению", "success", model);
  };
  if (variant === "full") {
    return (
      <Button variant={active ? "default" : "outline"} size="lg" onClick={onClick} className={className}>
        {active ? <Check data-icon="inline-start" /> : <GitCompareArrows data-icon="inline-start" />}
        {active ? "В сравнении" : "Сравнить"}
      </Button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={active ? "default" : "secondary"}
            size="icon"
            aria-pressed={active}
            aria-label={active ? "Убрать из сравнения" : "Добавить к сравнению"}
            onClick={onClick}
            className={cn("rounded-full shadow-sm", !active && "bg-background/85 backdrop-blur hover:bg-background", className)}
          />
        }
      >
        {active ? <Check /> : <GitCompareArrows />}
      </TooltipTrigger>
      <TooltipContent>{active ? "Убрать из сравнения" : "Добавить к сравнению"}</TooltipContent>
    </Tooltip>
  );
}

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={className}
            aria-label="Скопировать"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              try {
                await navigator.clipboard.writeText(value);
                setDone(true);
                notify("Скопировано", "info", value);
                setTimeout(() => setDone(false), 1200);
              } catch {
                /* clipboard unavailable */
              }
            }}
          />
        }
      >
        {done ? <Check className="text-success" /> : <Copy />}
      </TooltipTrigger>
      <TooltipContent>Скопировать модель</TooltipContent>
    </Tooltip>
  );
}

export function SpecBadges({ specs, max = 6, className }: { specs: string[]; max?: number; className?: string }) {
  if (!specs.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {specs.slice(0, max).map((s) => (
        <Badge key={s} variant="secondary" className="font-normal">
          {s}
        </Badge>
      ))}
    </div>
  );
}
