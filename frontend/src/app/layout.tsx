import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";

import { ConfigProvider } from "@/components/config-provider";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getSiteConfig, getSiteMeta } from "@/lib/server-api";
import { cn } from "@/lib/utils";

import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(!t){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}})()`;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteMeta();
  return {
    title: { default: `${settings.site_name} — ${settings.site_tagline}`, template: `%s · ${settings.site_name}` },
    description: settings.meta_description,
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#14161c" },
  ],
};

async function ConfigLoader({ children }: { children: React.ReactNode }) {
  const config = await getSiteConfig();
  const brand = /^#[0-9a-f]{3,8}$/i.test(config.settings.accent_color) ? config.settings.accent_color : null;
  return (
    <>
      {brand ? (
        <style>{`:root,.dark{--primary:${brand};--ring:${brand};--sidebar-primary:${brand};--sidebar-ring:${brand};--chart-1:${brand}}`}</style>
      ) : null}
      <ConfigProvider value={config}>{children}</ConfigProvider>
    </>
  );
}

function BootSplash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" suppressHydrationWarning className={cn(inter.variable)}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <TooltipProvider delay={300}>
          <Toaster>
            <Suspense fallback={<BootSplash />}>
              <ConfigLoader>{children}</ConfigLoader>
            </Suspense>
          </Toaster>
        </TooltipProvider>
      </body>
    </html>
  );
}
