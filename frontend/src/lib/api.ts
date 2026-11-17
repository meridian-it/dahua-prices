import type { Breakdown, CategoryInfo, CompareResponse, ProductFull, SearchResponse, SuggestResponse } from "./types";

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export async function parseError(res: Response): Promise<ApiError> {
  let detail: unknown = null;
  let message = `Ошибка ${res.status}`;
  try {
    const data = await res.json();
    detail = data?.detail;
    if (typeof detail === "string") message = detail;
    else if (detail && typeof detail === "object" && "errors" in detail) {
      message = Object.values((detail as { errors: Record<string, string> }).errors).join("; ");
    } else if (Array.isArray(detail)) {
      message = detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ") || message;
    }
  } catch {
    /* not json */
  }
  return new ApiError(res.status, message, detail);
}

export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export function searchProducts(qs: string, signal?: AbortSignal) {
  return getJSON<SearchResponse>(`/api/products?${qs}`, signal);
}

export function suggest(q: string, signal?: AbortSignal) {
  return getJSON<SuggestResponse>(`/api/products/suggest?q=${encodeURIComponent(q)}`, signal);
}

export function compareProducts(models: string[], signal?: AbortSignal) {
  const qs = new URLSearchParams({ models: models.join(",") });
  return getJSON<CompareResponse>(`/api/compare?${qs}`, signal);
}

export function getBreakdown(signal?: AbortSignal) {
  return getJSON<Breakdown>("/api/catalog/breakdown", signal);
}

export function getCategories(signal?: AbortSignal) {
  return getJSON<CategoryInfo[]>("/api/categories", signal);
}

export function getProduct(model: string, signal?: AbortSignal) {
  return getJSON<ProductFull>(`/api/products/by-model/${encodeURIComponent(model)}`, signal);
}
