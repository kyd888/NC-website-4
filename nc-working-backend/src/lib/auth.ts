import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import { getUserById, type PublicUser, toPublicUser } from "./users.js";

export const AUTH_COOKIE = "nc_auth";
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

function setCookie(res: Response, name: string, value: string, options: { maxAge?: number; expires?: Date } = {}) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const maxAge = options.maxAge ?? Math.floor(AUTH_TTL_MS / 1000);
  const expires = options.expires ? `; Expires=${options.expires.toUTCString()}` : "";
  const cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}${expires}`;
  res.append("Set-Cookie", cookie);
}

export function clearAuthCookie(res: Response) {
  const expires = new Date(0);
  res.append(
    "Set-Cookie",
    `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=${expires.toUTCString()}`,
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
  return token;
}

export function revokeAuthToken(token: string) {
  sessions.delete(token);
}

export function getAuthContext(req: Request): { token: string; user: PublicUser } | null {
  const cookies = readCookies(req.headers.cookie);
  const token = cookies[AUTH_COOKIE];
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
