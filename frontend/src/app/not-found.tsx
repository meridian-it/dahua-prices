import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function NotFound() {
  return (
    <Empty className="min-h-dvh">
      <EmptyHeader>
        <EmptyTitle className="text-5xl font-semibold text-primary">404</EmptyTitle>
        <EmptyDescription>Страница не найдена</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button nativeButton={false} render={<Link href="/" />}>В каталог</Button>
      </EmptyContent>
    </Empty>
  );
}
