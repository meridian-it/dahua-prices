"use client";

import { KeyRound, Trash2, UserPlus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { PageHeader } from "@/components/admin/admin-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminJSON, getUser, onAuthChange } from "@/lib/admin-api";
import { formatDateTime } from "@/lib/format";
import { notify } from "@/lib/notify";

type U = { id: number; username: string; is_active: boolean; last_login_at: string | null };

export default function UsersPage() {
  const me = useSyncExternalStore(onAuthChange, getUser, () => null);
  const [users, setUsers] = useState<U[] | null>(null);
  const [nu, setNu] = useState({ username: "", password: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => adminJSON<U[]>("/api/admin/users").then(setUsers);
  useEffect(() => {
    load();
  }, []);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      notify(ok);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Ошибка", "error");
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Пользователи"
        description="Администраторы панели. Первый создаётся из ADMIN_USERNAME / ADMIN_PASSWORD в .env."
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger render={<Button size="lg" />}>
              <UserPlus data-icon="inline-start" /> Добавить
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await run("add", () => adminJSON("/api/admin/users", { method: "POST", body: JSON.stringify(nu) }), "Пользователь создан")) {
                    setNu({ username: "", password: "" });
                    setAddOpen(false);
                    load();
                  }
                }}
              >
                <DialogHeader>
                  <DialogTitle>Новый администратор</DialogTitle>
                  <DialogDescription>Получит полный доступ к панели.</DialogDescription>
                </DialogHeader>
                <FieldGroup className="py-4">
                  <Field>
                    <FieldLabel htmlFor="nu-login">Логин</FieldLabel>
                    <Input id="nu-login" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} required minLength={3} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="nu-pass">Пароль</FieldLabel>
                    <Input id="nu-pass" type="password" autoComplete="new-password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} required minLength={8} />
                    <FieldDescription>Минимум 8 символов.</FieldDescription>
                  </Field>
                </FieldGroup>
                <DialogFooter>
                  <Button type="submit" disabled={busy === "add"}>
                    {busy === "add" ? <Spinner data-icon="inline-start" /> : null} Создать
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="self-start py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Пользователь</TableHead>
                <TableHead>Последний вход</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs uppercase">{u.username.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{u.username}</span>
                      {u.id === me?.id ? <Badge variant="secondary">это вы</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.last_login_at ? formatDateTime(u.last_login_at) : "ещё не входил"}</TableCell>
                  <TableCell className="pr-4 text-right">
                    {u.id !== me?.id ? (
                      <AlertDialog>
                        <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Удалить" />}>
                          <Trash2 className="text-destructive" />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Удалить {u.username}?</AlertDialogTitle>
                            <AlertDialogDescription>Пользователь потеряет доступ к панели управления.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => run(`del${u.id}`, () => adminJSON(`/api/admin/users/${u.id}`, { method: "DELETE" }), "Пользователь удалён").then(load)}
                            >
                              Удалить
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run("pw", () => adminJSON("/api/admin/me/password", { method: "POST", body: JSON.stringify(pw) }), "Пароль изменён")) {
                setPw({ current_password: "", new_password: "" });
              }
            }}
            className="flex flex-col gap-4"
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4" /> Сменить мой пароль
              </CardTitle>
              <CardDescription>Остальные сессии будут завершены.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="cur">Текущий пароль</FieldLabel>
                  <Input id="cur" type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new">Новый пароль</FieldLabel>
                  <Input id="new" type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} required minLength={8} />
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button type="submit" variant="outline" disabled={busy === "pw"} className="w-full">
                {busy === "pw" ? <Spinner data-icon="inline-start" /> : null} Сменить пароль
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </>
  );
}
