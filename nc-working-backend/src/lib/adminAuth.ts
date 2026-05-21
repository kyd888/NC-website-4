import type { Request, Response, NextFunction } from "express";

const ADMIN_COOKIE = "nc_admin_auth";
const ADMIN_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function expectedAdminKey() {
  return process.env.ADMIN_KEY || "super-secret-key";
}

function readCookies(header: string | undefined | null) {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const name = decodeURIComponent(trimmed.slice(0, idx));
    const value = decodeURIComponent(trimmed.slice(idx + 1));
    cookies[name] = value;
  }
  return cookies;
}

export function isAdminAuthenticated(req: Request) {
  const headerKey = req.headers["x-admin-key"];
  const key = Array.isArray(headerKey) ? headerKey[0] : headerKey;
  if (key && key === expectedAdminKey()) return true;

  const cookies = readCookies(req.headers.cookie);
  return cookies[ADMIN_COOKIE] === expectedAdminKey();
}

export function requireAdminApi(req: Request, res: Response, next: NextFunction) {
  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export function requireAdminPage(req: Request, res: Response, next: NextFunction) {
  if (!isAdminAuthenticated(req)) {
    const nextUrl = encodeURIComponent(req.originalUrl || "/admin");
    return res.redirect(`/admin/login?next=${nextUrl}`);
  }
  next();
}

export function setAdminCookie(res: Response, key: string) {
  const secureRequired = Boolean(process.env.RENDER) || process.env.NODE_ENV === "production";
  const secure = secureRequired ? "; Secure" : "";
  const sameSite = secureRequired ? "None" : "Lax";
  res.append(
    "Set-Cookie",
    `${ADMIN_COOKIE}=${encodeURIComponent(key)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${ADMIN_COOKIE_MAX_AGE_SECONDS}${secure}`,
  );
}

export function clearAdminCookie(res: Response) {
  res.append(
    "Set-Cookie",
    `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=${new Date(0).toUTCString()}`,
  );
}

export function verifyAdminKey(key: string) {
  return key === expectedAdminKey();
}
