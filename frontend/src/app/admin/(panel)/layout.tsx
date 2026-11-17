import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";

// The panel renders its pages only after the client-side auth check, so there is nothing to
// validate for instant navigation on the server.
export const instant = false;

export const metadata: Metadata = { title: "Админ-панель", robots: { index: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
