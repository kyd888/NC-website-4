import { Router } from "express";
import { z } from "zod";
import {
  authenticateUser,
  createUser,
  getUserById,
  toPublicUser,
  updateUser,
  type ShippingAddress,
} from "../lib/users.js";
import {
  clearAuthCookie,
  createAuthSession,
  getAuthContext,
  requireAuth,
  revokeAuthToken,
} from "../lib/auth.js";
import { groupSalesByOrder, listSales } from "../lib/sales.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const shippingSchema = z
  .object({
    line1: z.string().trim().min(1),
    line2: z.string().trim().optional(),
    city: z.string().trim().min(1),
    state: z.string().trim().min(1),
    postalCode: z.string().trim().min(1),
    country: z.string().trim().length(2),
  })
  .transform((value) => ({
    line1: value.line1.trim(),
    line2: value.line2?.trim() || undefined,
    city: value.city.trim(),
    state: value.state.trim(),
    postalCode: value.postalCode.trim(),
    country: value.country.trim().toUpperCase(),
  }));

const profileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  defaultShipping: shippingSchema.optional(),
});

export const accountRouter = Router();

accountRouter.post("/register", (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }
  try {
    const user = createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      name: parsed.data.name,
    });
    createAuthSession(user.id, res);
    res.json({ ok: true, user: toPublicUser(user) });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Email already")) {
      return res.status(409).json({ error: "Email already registered" });
    }
    console.error("[account] register error", error);
    return res.status(500).json({ error: "Unable to create account" });
  }
});

accountRouter.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }
  const existingCtx = getAuthContext(req);
  if (existingCtx) {
    revokeAuthToken(existingCtx.token);
    clearAuthCookie(res);
  }
  const user = authenticateUser(parsed.data.email, parsed.data.password);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  createAuthSession(user.id, res);
  res.json({ ok: true, user: toPublicUser(user) });
});

accountRouter.post("/logout", (req, res) => {
  const ctx = getAuthContext(req);
  if (ctx) {
    revokeAuthToken(ctx.token);
  }
  clearAuthCookie(res);
  res.json({ ok: true });
});

accountRouter.get("/me", (req, res) => {
  const ctx = getAuthContext(req);
  if (!ctx) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.json({ ok: true, user: ctx.user });
});

accountRouter.patch("/profile", (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid profile data" });
  }
  try {
    const updated = updateUser(ctx.user.id, {
      name: parsed.data.name,
      defaultShipping: parsed.data.defaultShipping as ShippingAddress | undefined,
    });
    res.json({ ok: true, user: toPublicUser(updated) });
  } catch (error) {
    console.error("[account] profile update error", error);
    res.status(500).json({ error: "Unable to update profile" });
  }
});

accountRouter.get("/orders", (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const all = listSales(2000).filter((sale) => sale.userId === ctx.user.id || sale.customerEmail === ctx.user.email);
  const orders = groupSalesByOrder(all);
  res.json({ ok: true, orders });
});

accountRouter.post("/shipping", (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const parsed = shippingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid shipping address" });
  }
  try {
    const updated = updateUser(ctx.user.id, {
      defaultShipping: parsed.data,
    });
    res.json({ ok: true, user: toPublicUser(updated) });
  } catch (error) {
    console.error("[account] shipping update error", error);
    res.status(500).json({ error: "Unable to save shipping address" });
  }
});

accountRouter.get("/shipping", (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const user = getUserById(ctx.user.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({ ok: true, shipping: user.defaultShipping ?? null });
});

