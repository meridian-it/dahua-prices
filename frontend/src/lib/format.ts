import type { PublicSettings } from "./types";

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export function formatPrice(value: number | null | undefined, s: Pick<PublicSettings, "currency_symbol">) {
  if (value === null || value === undefined) return "";
  return `${nf.format(value)} ${s.currency_symbol}`;
}

export function formatNumber(v: number) {
  return nf.format(v);
}

export function warrantyText(months: number | null | undefined) {
  if (!months) return "";
  if (months % 12 === 0) {
    const y = months / 12;
    return `${y} ${plural(y, "год", "года", "лет")}`;
  }
  return `${months} мес.`;
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function productHref(model: string) {
  return `/p/${encodeURIComponent(model)}`;
}

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
