"use client";

import { ApiError, parseError } from "./api";

/**
 * Admin auth: short-lived access token kept in memory only,
 * refresh token lives in an httpOnly cookie scoped to /api/auth (rotated on every refresh).
 */

type TokenResponse = { access_token: string; expires_in: number; user: { id: number; username: string } };

let accessToken: string | null = null;
let currentUser: TokenResponse["user"] | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function onAuthChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getUser() {
  return currentUser;
}

function setSession(data: TokenResponse | null) {
  accessToken = data?.access_token ?? null;
  currentUser = data?.user ?? null;
  emit();
}

export async function login(username: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
    credentials: "same-origin",
  });
  if (!res.ok) throw await parseError(res);
  setSession(await res.json());
}

export function refresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
        if (!res.ok || res.status === 204) {
          setSession(null);
          return false;
        }
        setSession(await res.json());
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  setSession(null);
}

export async function ensureSession(): Promise<boolean> {
  if (accessToken) return true;
  return refresh();
}

export async function adminFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  if (!accessToken) await refresh();
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(path, { ...init, headers, credentials: "same-origin" });
  if (res.status === 401 && retry) {
    accessToken = null;
    if (await refresh()) return adminFetch(path, init, false);
    if (typeof window !== "undefined" && !location.pathname.startsWith("/admin/login")) {
      location.href = `/admin/login?next=${encodeURIComponent(location.pathname)}`;
    }
  }
  return res;
}

export async function adminJSON<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await adminFetch(path, init);
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export { ApiError };
