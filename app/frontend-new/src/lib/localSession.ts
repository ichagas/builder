/**
 * Local dev sign-in session (VITE_AUTH_MODE=local).
 *
 * Stores the JWT returned by POST /api/v1/auth/dev-login. Kept in
 * localStorage (not sessionStorage) on purpose: it mirrors MSAL's own
 * localStorage cache, survives reloads and new tabs (realtime + several
 * tabs are common in dev), and the token is dev-only and expires in 12 h —
 * expiry is also checked client-side. Nothing here ever runs in production.
 */
import i18n from "i18next";

export interface LocalSessionUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

export interface LocalSession {
  token: string;
  user: LocalSessionUser;
}

const STORAGE_KEY = "pronghorn_local_dev_session";
const listeners = new Set<() => void>();

function decodeExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export function getLocalSession(): LocalSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as LocalSession;
    if (!s?.token || !s?.user?.id) return null;
    const exp = decodeExp(s.token);
    if (exp !== null && exp * 1000 <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function getLocalToken(): string | null {
  return getLocalSession()?.token ?? null;
}

function notify(): void {
  listeners.forEach((l) => l());
}

export function clearLocalSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable
  }
  notify();
}

export function subscribeLocalSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Calls dev-login and stores the session. Throws Error(message) on failure. */
export async function signInLocal(email: string, name: string): Promise<LocalSession> {
  const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name }),
    });
  } catch {
    throw new Error(i18n.t("auth.local.errors.unreachable"));
  }
  if (!response.ok) {
    let message = i18n.t("auth.local.errors.status", { status: response.status });
    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {
      // non-JSON body
    }
    if (response.status === 404) {
      message = i18n.t("auth.local.errors.notAvailable");
    }
    throw new Error(message);
  }
  const session = (await response.json()) as LocalSession;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: session.token, user: session.user }));
  notify();
  return session;
}

/** 401 handling in local mode: drop the session and go back to the sign-in screen. */
export function handleLocalUnauthorized(): void {
  clearLocalSession();
  if (typeof window !== "undefined" && window.location.pathname !== "/auth") {
    // Keep where the user was so sign-in can return there.
    const returnTo = `${window.location.pathname}${window.location.search ?? ""}`;
    window.location.assign(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
  }
}
