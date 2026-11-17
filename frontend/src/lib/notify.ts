"use client";

import { toast } from "@/components/ui/toast";

export function notify(title: string, type: "success" | "info" | "warning" | "error" = "success", description?: string) {
  toast.add({ title, description, type, timeout: 2600 });
}
