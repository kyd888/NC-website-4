import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import { getUserById, type PublicUser, toPublicUser } from "./users.js";

export const AUTH_COOKIE = "nc_auth";
/** Cookie-less fallback for browsers that block third-party cookies. */
export const AUTH_HEADER = "X-Auth-Token";
const AUTH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type SessionRecord = {
  userId: string;
  issuedAt: number;
  lastSeenAt: number;
};

const sessions = new Map<string, SessionRecord>();

function readCookies(header: string | undefined | null) {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  const parts = header.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (!part) continue;
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = decodeURIComponent(part.slice(0, idx));
    const value = decodeURIComponent(part.slice(idx + 1));
    cookies[key] = value;
  }
  return cookies;
}

// The frontend and the API are on different sites (Netlify vs Render), so the
// auth cookie is a third-party cookie. SameSite=Lax is never sent on a
// cross-site fetch, which left every authenticated call unauthenticated —
// same reasoning as the cart session in routes/catalog.ts.
function cookieAttributes() {
  const crossSite = Boolean(process.env.RENDER) || process.env.NODE_ENV === "production";
  return crossSite ? "; SameSite=None; Secure" : "; SameSite=Lax";
}

function setCookie(res: Response, name: string, value: string, options: { maxAge?: number; expires?: Date } = {}) {
  const maxAge = options.maxAge ?? Math.floor(AUTH_TTL_MS / 1000);
  const expires = options.expires ? `; Expires=${options.expires.toUTCString()}` : "";
  const cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly${cookieAttributes()}; Max-Age=${maxAge}${expires}`;
  res.append("Set-Cookie", cookie);
}

export function clearAuthCookie(res: Response) {
  const expires = new Date(0);
  // Attributes must match the cookie that was set, or the browser won't clear it.
  res.append(
    "Set-Cookie",
    `${AUTH_COOKIE}=; Path=/; HttpOnly${cookieAttributes()}; Max-Age=0; Expires=${expires.toUTCString()}`,
  );
}

export function createAuthSession(userId: string, res: Response) {
  const token = randomUUID().replace(/-/g, "");
  sessions.set(token, {
    userId,
    issuedAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  setCookie(res, AUTH_COOKIE, token);
  // Safari blocks third-party cookies outright, so hand the token back in a
  // header too; the frontend stores it and returns it as x-auth-token.
  // Deliberately NOT x-session-id — that header belongs to the cart session in
  // routes/catalog.ts, and sharing it would make login clobber the bag.
  res.setHeader(AUTH_HEADER, token);
  return token;
}

export function revokeAuthToken(token: string) {
  sessions.delete(token);
}

function readAuthToken(req: Request): string | null {
  // Header first — it is the only path that survives Safari's cookie blocking.
  const headerToken = req.get(AUTH_HEADER);
  if (typeof headerToken === "string") {
    const trimmed = headerToken.trim();
    if (/^[A-Za-z0-9\-_]{8,}$/.test(trimmed) && sessions.has(trimmed)) return trimmed;
  }
  return readCookies(req.headers.cookie)[AUTH_COOKIE] ?? null;
}

export function getAuthContext(req: Request): { token: string; user: PublicUser } | null {
  const token = readAuthToken(req);
  if (!token) return null;
  const record = sessions.get(token);
  if (!record) return null;
  if (record.lastSeenAt + AUTH_TTL_MS < Date.now()) {
    sessions.delete(token);
    return null;
  }
  record.lastSeenAt = Date.now();
  const user = getUserById(record.userId);
  if (!user) {
    sessions.delete(token);
    return null;
  }
  return { token, user: toPublicUser(user) };
}

export function requireAuth(req: Request, res: Response) {
  const ctx = getAuthContext(req);
  if (!ctx) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return ctx;
}

export function touchAuthSession(token: string) {
  const record = sessions.get(token);
  if (record) {
    record.lastSeenAt = Date.now();
  }
}
