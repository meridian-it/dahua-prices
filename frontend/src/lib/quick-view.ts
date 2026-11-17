"use client";

import { useSyncExternalStore } from "react";

/** Global "quick view" sheet: any card can open a product without leaving the page. */
let current: string | null = null;
const listeners = new Set<() => void>();

export function openQuickView(model: string) {
  current = model;
  listeners.forEach((l) => l());
}

export function closeQuickView() {
  current = null;
  listeners.forEach((l) => l());
}

export function useQuickView() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
}

/** Plain click opens the quick view; ctrl/cmd/middle click keep normal link behaviour. */
export function quickViewClick(model: string) {
  return (e: React.MouseEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openQuickView(model);
  };
}
