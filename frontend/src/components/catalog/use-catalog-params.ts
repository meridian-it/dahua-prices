"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type CatalogState = {
  q: string;
  category: string[];
  kind: string[];
  tech: string[];
  form: string[];
  mp: string[];
  features: string[];
  price_min: string;
  price_max: string;
  is_new: boolean;
  eol: string;
  sort: string;
  smart: boolean;
  view: "" | "grid" | "table";
};

export const LIST_KEYS = ["category", "kind", "tech", "form", "mp", "features"] as const;
export type ListKey = (typeof LIST_KEYS)[number];

export const EMPTY_FILTERS: Partial<CatalogState> = {
  category: [],
  kind: [],
  tech: [],
  form: [],
  mp: [],
  features: [],
  price_min: "",
  price_max: "",
  is_new: false,
  eol: "default",
};

export function useCatalogParams() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const state: CatalogState = useMemo(() => {
    const list = (k: string) => sp.getAll(k).flatMap((v) => v.split(",")).filter(Boolean);
    return {
      q: sp.get("q") ?? "",
      category: list("category"),
      kind: list("kind"),
      tech: list("tech"),
      form: list("form"),
      mp: list("mp"),
      features: list("features"),
      price_min: sp.get("price_min") ?? "",
      price_max: sp.get("price_max") ?? "",
      is_new: sp.get("is_new") === "1",
      eol: sp.get("eol") ?? "default",
      sort: sp.get("sort") ?? "relevance",
      smart: sp.get("smart") !== "0",
      view: (sp.get("view") as CatalogState["view"]) ?? "",
    };
  }, [sp]);

  const update = useCallback(
    (patch: Partial<CatalogState>, opts: { replace?: boolean } = {}) => {
      const next = { ...state, ...patch };
      const p = new URLSearchParams();
      if (next.q) p.set("q", next.q);
      for (const k of LIST_KEYS) if (next[k].length) p.set(k, next[k].join(","));
      if (next.price_min) p.set("price_min", next.price_min);
      if (next.price_max) p.set("price_max", next.price_max);
      if (next.is_new) p.set("is_new", "1");
      if (next.eol && next.eol !== "default") p.set("eol", next.eol);
      if (next.sort && next.sort !== "relevance") p.set("sort", next.sort);
      if (!next.smart) p.set("smart", "0");
      if (next.view) p.set("view", next.view);
      const qs = p.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (opts.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [state, router, pathname],
  );

  const toggleIn = useCallback(
    (key: ListKey, value: string) => {
      const cur = state[key];
      update({ [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] } as Partial<CatalogState>);
    },
    [state, update],
  );

  const apiQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    for (const k of LIST_KEYS) if (state[k].length) p.set(k, state[k].join(","));
    if (state.price_min) p.set("price_min", state.price_min);
    if (state.price_max) p.set("price_max", state.price_max);
    if (state.is_new) p.set("is_new", "true");
    if (state.eol !== "default") p.set("eol", state.eol);
    if (state.sort !== "relevance") p.set("sort", state.sort);
    if (!state.smart) p.set("smart", "false");
    return p.toString();
  }, [state]);

  return { state, update, toggleIn, apiQuery, sp };
}
