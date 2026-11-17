"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useConfig } from "@/components/config-provider";
import { LogoMark } from "@/components/logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { login } from "@/lib/admin-api";

export function LoginForm() {
  const { settings } = useConfig();
  const router = useRouter();
  const sp = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      const next = sp.get("next");
      router.replace(next && next.startsWith("/admin") ? next : "/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <Link href="/" className="flex items-center gap-2 self-center font-semibold">
        <LogoMark className="size-8" />
        {settings.site_name}
      </Link>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Вход в панель управления</CardTitle>
          <CardDescription>Импорт прайса, настройки и пользователи</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="username">Логин</FieldLabel>
                <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Пароль</FieldLabel>
                <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" size="lg" disabled={busy} className="w-full">
                {busy ? <Spinner data-icon="inline-start" /> : <LockKeyhole data-icon="inline-start" />}
                Войти
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <Button variant="link" className="self-center text-muted-foreground" nativeButton={false} render={<Link href="/" />}>
        ← Вернуться в каталог
      </Button>
    </div>
  );
}
