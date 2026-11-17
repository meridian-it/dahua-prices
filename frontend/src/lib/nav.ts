import {
  Cctv,
  DoorOpen,
  HardDrive,
  LayoutGrid,
  type LucideIcon,
  Monitor,
  Network,
  RotateCw,
  Siren,
  Sparkles,
  Thermometer,
  Video,
  Webcam,
  Wrench,
} from "lucide-react";

import type { Breakdown } from "./types";

export type NavPreset = {
  id: string;
  label: string;
  icon: LucideIcon;
  params: Partial<Record<"kind" | "tech" | "form" | "is_new", string>>;
};

/** "Shop by type" navigation. Each item is just a preset of catalog filters. */
export const TYPE_NAV: NavPreset[] = [
  { id: "all", label: "Все товары", icon: LayoutGrid, params: {} },
  { id: "new", label: "Новинки", icon: Sparkles, params: { is_new: "1" } },
  { id: "ip", label: "IP-камеры", icon: Cctv, params: { kind: "camera", tech: "ip" } },
  { id: "hdcvi", label: "HDCVI-камеры", icon: Video, params: { kind: "camera", tech: "hdcvi" } },
  { id: "ptz", label: "Поворотные PTZ / PT", icon: RotateCw, params: { form: "ptz,pt" } },
  { id: "rec", label: "Видеорегистраторы", icon: HardDrive, params: { kind: "recorder" } },
  { id: "net", label: "Сеть и PoE", icon: Network, params: { kind: "switch,network" } },
  { id: "intercom", label: "Домофония", icon: Webcam, params: { kind: "intercom" } },
  { id: "access", label: "СКУД", icon: DoorOpen, params: { kind: "access" } },
  { id: "alarm", label: "Сигнализация", icon: Siren, params: { kind: "alarm" } },
  { id: "thermal", label: "Тепловизоры", icon: Thermometer, params: { kind: "thermal" } },
  { id: "monitor", label: "Мониторы", icon: Monitor, params: { kind: "monitor" } },
  { id: "acc", label: "Аксессуары", icon: Wrench, params: { kind: "accessory" } },
];

const NAV_KEYS = ["kind", "tech", "form", "is_new"] as const;

export function navHref(p: NavPreset) {
  const qs = new URLSearchParams(p.params as Record<string, string>).toString();
  return qs ? `/?${qs}` : "/";
}

type Getter = { get(k: string): string | null };

/** nav item matching current type filters exactly (or null) */
export function activeNav(sp: Getter): NavPreset | null {
  return (
    TYPE_NAV.find((item) =>
      NAV_KEYS.every((k) => (sp.get(k) ?? "") === ((item.params as Record<string, string>)[k] ?? "")),
    ) ?? null
  );
}

export function navCount(p: NavPreset, b: Breakdown | null): number | null {
  if (!b) return null;
  if (p.params.is_new) return b.new;
  const kinds = p.params.kind?.split(",");
  const forms = p.params.form?.split(",");
  return b.rows
    .filter(
      (r) =>
        (!kinds || kinds.includes(r.kind)) &&
        (!p.params.tech || r.tech === p.params.tech) &&
        (!forms || (r.form !== null && forms.includes(r.form))),
    )
    .reduce((n, r) => n + r.count, 0);
}
