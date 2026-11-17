"use client";

import { Mail, Phone, Send } from "lucide-react";

import { useConfig } from "@/components/config-provider";
import { formatDate } from "@/lib/format";

export function SiteFooter() {
  const { settings, catalog } = useConfig();
  const tg = settings.contact_telegram
    ? settings.contact_telegram.startsWith("http")
      ? settings.contact_telegram
      : `https://t.me/${settings.contact_telegram.replace(/^@/, "")}`
    : null;
  const contacts = [
    settings.contact_phone && { icon: Phone, label: settings.contact_phone, href: `tel:${settings.contact_phone.replace(/[^+\d]/g, "")}` },
    settings.contact_email && { icon: Mail, label: settings.contact_email, href: `mailto:${settings.contact_email}` },
    tg && { icon: Send, label: settings.contact_telegram, href: tg },
  ].filter(Boolean) as { icon: typeof Phone; label: string; href: string }[];

  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-1">
          <p>
            <span className="font-medium text-foreground">{settings.site_name}</span>
            {catalog.updated_at ? <> · прайс от {formatDate(catalog.updated_at)}</> : null}
            {settings.contact_address ? <> · {settings.contact_address}</> : null}
          </p>
          {settings.footer_note ? <p className="text-xs">{settings.footer_note}</p> : null}
        </div>
        {contacts.length ? (
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {contacts.map((c) => (
              <a key={c.href} href={c.href} className="inline-flex items-center gap-1.5 hover:text-foreground" target={c.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                <c.icon className="size-3.5" /> {c.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </footer>
  );
}
