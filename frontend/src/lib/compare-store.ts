"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "it-trade:compare";
const EMPTY: string[] = [];
let cache: string[] | null = null;
const listeners = new Set<() => void>();

function read(): string[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as string[]).filter((x) => typeof x === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(list: string[]) {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full / disabled */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCompare(max = 6) {
  const list = useSyncExternalStore(subscribe, read, () => EMPTY);

  const has = useCallback((model: string) => list.includes(model), [list]);
  const toggle = useCallback(
    (model: string): "added" | "removed" | "full" => {
      const cur = read();
      if (cur.includes(model)) {
        write(cur.filter((m) => m !== model));
        return "removed";
      }
      if (cur.length >= max) return "full";
      write([...cur, model]);
      return "added";
    },
    [max],
  );
  const remove = useCallback((model: string) => write(read().filter((m) => m !== model)), []);
  const set = useCallback((models: string[]) => write(models.slice(0, max)), [max]);
  const clear = useCallback(() => write([]), []);

  return { list, has, toggle, remove, set, clear, max };
}
