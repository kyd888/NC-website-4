import path from "path";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";

import { adminRouter } from "./routes/admin.js";
import { accountRouter } from "./routes/account.js";
import { catalogRouter } from "./routes/catalog.js";
import { adminUiRouter } from "./routes/admin_ui.js";
import { seedInventory, registerVaultSavesGetter } from "./lib/inventory.js";
import { initializePersistentStores } from "./lib/persistence.js";
import { getVaultSnapshot } from "./lib/vault.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = Boolean(process.env.RENDER) || process.env.NODE_ENV === "production";

// Require a strong ADMIN_KEY in production
if (isProd && (!process.env.ADMIN_KEY || process.env.ADMIN_KEY.length < 20)) {
  console.error("FATAL: ADMIN_KEY env var must be set (min 20 chars) in production");
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT || 8787);

// Render (and most cloud platforms) sit behind a reverse proxy — trust the
// first hop so express-rate-limit reads the real client IP from X-Forwarded-For
app.set("trust proxy", 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(
  helmet({
    // Allow images/fonts to be loaded cross-origin (product images served from backend)
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // CSP is handled by Netlify _headers on the frontend
    contentSecurityPolicy: false,
  }),
);

// ── CORS (applied to /api only — admin panel is same-origin, needs no CORS) ───
const allowList = [
  process.env.FRONTEND_ORIGIN,
  process.env.FRONTEND_ORIGIN_2,
  process.env.BACKEND_ORIGIN,
]
  .filter(Boolean)
  .map((origin) => origin!.replace(/\/+$/g, ""));

const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    try {
      const normalized = origin.replace(/\/+$/g, "");
      const { hostname } = new URL(origin);
      const allowed =
        allowList.includes(normalized) ||
        allowList.includes(origin) ||
        (!isProd && hostname.endsWith(".netlify.app")) ||
        (allowList.length === 0 && hostname.endsWith(".netlify.app")) ||
        hostname === "localhost" ||
        hostname === "127.0.0.1";
      return allowed
        ? callback(null, true)
        : callback(new Error("Origin not allowed by CORS"));
    } catch {
      return callback(new Error("Origin not allowed by CORS"));
    }
  },
  credentials: true,
  exposedHeaders: ["X-Session-Id"],
});

app.use("/api", corsMiddleware);

// ── Rate limiting ─────────────────────────────────────────────────────────────
// General API limit: 300 req / 15 min per IP
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  }),
);

// Strict limit on checkout / cart to discourage bots: 20 req / min per IP
const strictLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down" },
});
app.use("/api/checkout", strictLimit);
app.use("/api/cart", strictLimit);
app.use("/api/save", strictLimit);

// ── Body parsing (with size cap) ──────────────────────────────────────────────
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

// ── Static files ──────────────────────────────────────────────────────────────
const staticRoot = path.resolve(__dirname, "../public");
app.use("/uploads", express.static(path.join(staticRoot, "uploads")));
app.use(express.static(staticRoot));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/admin", adminRouter);
app.use("/api/account", accountRouter);
app.use("/api", catalogRouter);
app.use("/admin", adminUiRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "nc-backend" });
});

// ── Global error handler (strips stack traces from responses) ─────────────────
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[unhandled error]", err);
    const status =
      typeof (err as any)?.status === "number" ? (err as any).status : 500;
    res.status(status).json({ error: "Internal server error" });
  },
);

// ── Startup ───────────────────────────────────────────────────────────────────
await initializePersistentStores();
seedInventory();
registerVaultSavesGetter((productId) => getVaultSnapshot()[productId]?.saves ?? 0);


app.listen(PORT, () => {
  console.log(`NC backend ready on http://localhost:${PORT}`);
  if (!isProd) console.log(`Admin UI: http://localhost:${PORT}/admin`);
});
