import { QuickViewHost } from "@/components/product/quick-view";
import { CommandSearch } from "@/components/site/command-search";
import { CompareDock } from "@/components/site/compare-dock";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <CommandSearch />
      <QuickViewHost />
      <CompareDock />
    </div>
  );
}
