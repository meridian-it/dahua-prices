import "server-only";

import { cacheLife } from "next/cache";

import type { ProductFull, PublicSettings, SiteConfig } from "./types";

// Server components talk to the backend directly inside the docker network.
const INTERNAL_API = process.env.INTERNAL_API_URL || "http://backend:8000";

export const FALLBACK_CONFIG: SiteConfig = {
  settings: {
    site_name: "IT-Trade",
    site_tagline: "Прайс-лист и подбор оборудования Dahua",
    brand_vendor: "Dahua",
    accent_color: "#2563eb",
    meta_description: "",
    contact_phone: "",
    contact_email: "",
    contact_telegram: "",
    contact_address: "",
    work_hours: "",
    website_url: "",
    footer_note: "",
    show_prices: true,
    price_label: "РРЦ",
    currency_symbol: "₽",
    price_on_request_text: "По запросу",
    page_size: 30,
    compare_max: 6,
    default_view: "table",
    hide_eol: false,
    show_price_changes: true,
    search_examples: "",
  },
  catalog: { updated_at: null, total: 0 },
  labels: { kinds: {}, forms: {}, tech: {}, features: {}, specs: {} },
};

export async function getSiteConfig(): Promise<SiteConfig> {
  try {
    const res = await fetch(`${INTERNAL_API}/api/settings/public`, { cache: "no-store" });
    if (!res.ok) return FALLBACK_CONFIG;
    return (await res.json()) as SiteConfig;
  } catch {
    return FALLBACK_CONFIG;
  }
}

/**
 * Settings for <title>/<meta>: cached (Next requires metadata to be cacheable so navigations
 * aren't blocked). Refreshed in the background every minute; the page body always uses the live
 * getSiteConfig(), so admin changes show up immediately everywhere except the tab title.
 */
export async function getSiteMeta(): Promise<Pick<PublicSettings, "site_name" | "site_tagline" | "meta_description">> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 86400 });
  const { settings } = await getSiteConfig();
  return {
    site_name: settings.site_name,
    site_tagline: settings.site_tagline,
    meta_description: settings.meta_description,
  };
}

export async function getProduct(model: string): Promise<ProductFull | null> {
  try {
    const res = await fetch(
      `${INTERNAL_API}/api/products/by-model/${encodeURIComponent(model)}`,
      { cache: "no-store" },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`API ${res.status}`);
    return (await res.json()) as ProductFull;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("API")) throw e;
    throw new Error("Сервис каталога недоступен");
  }
}
