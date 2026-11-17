"use client";

import { createContext, use } from "react";

import type { SiteConfig } from "@/lib/types";

const ConfigContext = createContext<SiteConfig | null>(null);

export function ConfigProvider({ value, children }: { value: SiteConfig; children: React.ReactNode }) {
  return <ConfigContext value={value}>{children}</ConfigContext>;
}

export function useConfig(): SiteConfig {
  const ctx = use(ConfigContext);
  if (!ctx) throw new Error("ConfigProvider missing");
  return ctx;
}
