import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "./crypto";

export class GoogleError extends Error {
  constructor(message: string, public readonly reconnect = false) { super(message); }
}

const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.freebusy", "openid", "email"].join(" ");

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

export function b64url(b: Buffer) { return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

/** PKCE + opaque single-use state. The state is bound to user+workspace by the HttpOnly cookie that carries it. */
export function beginAuth() {
  const verifier = b64url(randomBytes(48));
  const state = b64url(randomBytes(24));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  u.searchParams.set("redirect_uri", process.env.GOOGLE_REDIRECT_URI!);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return { url: u.toString(), verifier, state };
}

interface Tokens { access_token: string; refresh_token?: string; expires_at: number; email?: string }

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new GoogleError(json.error_description || json.error || "Google token request failed", json.error === "invalid_grant");
  return json;
}

export async function exchangeCode(code: string, verifier: string): Promise<Tokens> {
  const j = await tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: process.env.GOOGLE_REDIRECT_URI! });
  let email: string | undefined;
  if (j.id_token) {
    try { email = JSON.parse(Buffer.from(j.id_token.split(".")[1], "base64").toString("utf8")).email; } catch { /* no email claim */ }
  }
  return { access_token: j.access_token!, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 - 30_000, email };
}

export async function saveTokens(workspaceId: string, userId: string, t: Tokens) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("store_calendar_tokens", { p_workspace: workspaceId, p_user: userId, p_cipher: encrypt(JSON.stringify(t)), p_email: t.email ?? null });
  if (error) throw new Error(error.message);
}

/** Loads the employee's tokens (service-role, workspace scoped), refreshing when expired. Returns null when not connected. */
export async function accessTokenFor(workspaceId: string, userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("read_calendar_tokens", { p_workspace: workspaceId, p_user: userId });
  if (error) throw new Error(error.message);
  if (!data) return null;
  const t = JSON.parse(decrypt(String(data))) as Tokens;
  if (t.expires_at > Date.now()) return t.access_token;
  if (!t.refresh_token) throw new GoogleError("Google session expired; reconnect the calendar.", true);
  try {
    const j = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token });
    const next: Tokens = { ...t, access_token: j.access_token!, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 - 30_000 };
    await admin.rpc("store_calendar_tokens", { p_workspace: workspaceId, p_user: userId, p_cipher: encrypt(JSON.stringify(next)), p_email: t.email ?? null });
    return next.access_token;
  } catch (e) {
    if (e instanceof GoogleError && e.reconnect) await admin.rpc("set_calendar_status", { p_workspace: workspaceId, p_user: userId, p_status: "revoked", p_error: "Google access was revoked; reconnect." });
    throw e;
  }
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok) throw new GoogleError(json.error?.message ? `Google: ${json.error.message}`.slice(0, 180) : "Google Calendar request failed", res.status === 401);
  return json;
}

/** True when the primary calendar has anything in [start, end). */
export async function isBusy(token: string, startIso: string, endIso: string): Promise<boolean> {
  const j = await api<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>(token, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({ timeMin: startIso, timeMax: endIso, items: [{ id: "primary" }] }),
  });
  return (j.calendars?.primary?.busy?.length ?? 0) > 0;
}

export async function insertEvent(token: string, e: { summary: string; description: string; startIso: string; endIso: string; tz: string }) {
  const j = await api<{ id: string; htmlLink?: string }>(token, "/calendars/primary/events", {
    method: "POST",
    body: JSON.stringify({ summary: e.summary, description: e.description, start: { dateTime: e.startIso, timeZone: e.tz }, end: { dateTime: e.endIso, timeZone: e.tz } }),
  });
  return j.id;
}

export async function patchEvent(token: string, eventId: string, e: { startIso: string; endIso: string; tz: string }) {
  await api(token, `/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify({ start: { dateTime: e.startIso, timeZone: e.tz }, end: { dateTime: e.endIso, timeZone: e.tz } }),
  });
}

export async function deleteEvent(token: string, eventId: string) {
  await api(token, `/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
}
