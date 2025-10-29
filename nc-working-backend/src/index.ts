import path from "path";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { fileURLToPath } from "url";

import { adminRouter } from "./routes/admin.js";
import { accountRouter } from "./routes/account.js";
import { catalogRouter } from "./routes/catalog.js";
import { adminUiRouter } from "./routes/admin_ui.js";
import { seedInventory } from "./lib/inventory.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = Number(process.env.PORT || 8787);

const allowList = [
  process.env.FRONTEND_ORIGIN,
  process.env.FRONTEND_ORIGIN_2,
  process.env.BACKEND_ORIGIN,
]
  .filter(Boolean)
  .map((origin) => origin!.replace(/\/+$/g, ""));

console.log("CORS allowList:", allowList);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      try {
        const normalized = origin.replace(/\/+$/g, "");
        const { hostname } = new URL(origin);
        const allowed =
          allowList.includes(normalized) ||
          allowList.includes(origin) ||
          hostname.endsWith(".netlify.app") ||
          hostname === "localhost" ||
          hostname === "127.0.0.1";
        return allowed ? callback(null, true) : callback(new Error("Origin not allowed by CORS"));
      } catch {
        return callback(new Error("Origin not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const staticRoot = path.resolve(__dirname, "../public");
app.use("/uploads", express.static(path.join(staticRoot, "uploads")));
app.use(express.static(staticRoot));

app.use("/api/admin", adminRouter);
app.use("/api/account", accountRouter);
app.use("/api", catalogRouter);
app.use("/admin", adminUiRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Helpful root handler to avoid "Cannot GET /"
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "nc-backend", docs: "/api/health" });
});

seedInventory();

app.listen(PORT, () => {
  console.log(`NC backend ready on http://localhost:${PORT}`);
  console.log(`Admin UI:       http://localhost:${PORT}/admin`);
});
