"use client";

import { Share2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { notify } from "@/lib/notify";
import type { ProductFull } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ProductImage } from "./bits";
import { ProductCard } from "./product-card";
import { ProductSummary, ProductTabs } from "./product-details";

export function ProductView({ p }: { p: ProductFull }) {
  const gallery = p.images.length ? p.images : p.image_url ? [p.image_url] : [];
  const [active, setActive] = useState(0);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      notify("Ссылка скопирована", "info");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-6 sm:py-8 sm:px-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Каталог</BreadcrumbLink>
          </BreadcrumbItem>
          {p.category ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={`/?category=${p.category.slug}`} />}>{p.category.name}</BreadcrumbLink>
              </BreadcrumbItem>
            </>
          ) : null}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="truncate">{p.model}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <ProductImage
            src={gallery[active]}
            alt={p.model}
            kind={p.kind}
            form={p.form_factor}
            pad="p-[14%]"
            hint={!gallery.length}
            className="aspect-square w-full rounded-2xl border"
          />
          {gallery.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto">
              {gallery.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn("shrink-0 overflow-hidden rounded-lg border-2 transition-colors", i === active ? "border-primary" : "border-transparent hover:border-border")}
                >
                  <ProductImage src={src} alt="" kind={p.kind} form={p.form_factor} className="size-16" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-8">
          <ProductSummary
            p={p}
            actions={
              <Button variant="ghost" size="lg" onClick={share}>
                <Share2 data-icon="inline-start" /> Поделиться
              </Button>
            }
          />
          <ProductTabs p={p} />
        </div>
      </div>

      {p.similar?.length ? (
        <section className="flex flex-col gap-4 border-t pt-8">
          <h2 className="text-lg font-semibold tracking-tight">Похожие товары</h2>
          <div>
            <Carousel opts={{ align: "start" }} className="w-full">
              <CarouselContent className="-ml-4">
                {p.similar.map((s) => (
                  <CarouselItem key={s.id} className="basis-1/2 pl-4 md:basis-1/3 xl:basis-1/4">
                    <ProductCard p={s} />
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="-left-3 hidden sm:flex" />
              <CarouselNext className="-right-3 hidden sm:flex" />
            </Carousel>
          </div>
        </section>
      ) : null}
    </div>
  );
}
