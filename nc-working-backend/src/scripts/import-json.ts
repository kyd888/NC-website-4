import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { closeDb, dbEnabled, dbQuery } from "../lib/db.js";
import { schemaSql } from "../lib/schema.js";

dotenv.config();

function argValue(name: string) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : undefined;
}

function readJson<T>(dir: string, filename: string, fallback: T): T {
  const file = path.resolve(dir, filename);
  if (!fs.existsSync(file)) return fallback;
  const raw = fs.readFileSync(file, "utf8");
  if (!raw.trim()) return fallback;
  return JSON.parse(raw) as T;
}

function isoDate(value: unknown) {
  if (typeof value === "string" && Number.isFinite(new Date(value).getTime())) return new Date(value).toISOString();
  return new Date().toISOString();
}

async function importUsers(dir: string) {
  const rows = readJson<any[]>(dir, "users.json", []);
  for (const user of rows) {
    if (!user?.id || !user?.email) continue;
    await dbQuery(
      `INSERT INTO users (id, email, password_hash, name, default_shipping, created_at, updated_at, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         name = EXCLUDED.name,
         default_shipping = EXCLUDED.default_shipping,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at,
         last_login_at = EXCLUDED.last_login_at`,
      [
        String(user.id),
        String(user.email).trim().toLowerCase(),
        String(user.passwordHash ?? user.password_hash ?? ""),
        typeof user.name === "string" ? user.name : null,
        user.defaultShipping ?? user.default_shipping ?? null,
        isoDate(user.createdAt ?? user.created_at),
        isoDate(user.updatedAt ?? user.updated_at),
        user.lastLoginAt || user.last_login_at ? isoDate(user.lastLoginAt ?? user.last_login_at) : null,
      ],
    );
  }
  return rows.length;
}

async function importSales(dir: string) {
  const rows = readJson<any[]>(dir, "sales.json", []);
  for (const sale of rows) {
    if (!sale?.id || !sale?.productId) continue;
    const qty = Math.max(1, Math.floor(Number(sale.qty) || 1));
    const priceCents = Math.max(0, Math.floor(Number(sale.priceCents) || 0));
    await dbQuery(
      `INSERT INTO sales (
        id, ts, product_id, qty, price_cents, ref, ua, user_id, customer_name,
        customer_email, product_title, drop_id, shipping_address, order_id, line_total_cents
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE SET
        ts = EXCLUDED.ts,
        product_id = EXCLUDED.product_id,
        qty = EXCLUDED.qty,
        price_cents = EXCLUDED.price_cents,
        ref = EXCLUDED.ref,
        ua = EXCLUDED.ua,
        user_id = EXCLUDED.user_id,
        customer_name = EXCLUDED.customer_name,
        customer_email = EXCLUDED.customer_email,
        product_title = EXCLUDED.product_title,
        drop_id = EXCLUDED.drop_id,
        shipping_address = EXCLUDED.shipping_address,
        order_id = EXCLUDED.order_id,
        line_total_cents = EXCLUDED.line_total_cents`,
      [
        String(sale.id),
        isoDate(sale.ts),
        String(sale.productId),
        qty,
        priceCents,
        sale.ref ?? null,
        sale.ua ?? null,
        sale.userId ?? null,
        sale.customerName ?? null,
        sale.customerEmail ?? null,
        sale.productTitle ?? null,
        sale.dropId ?? null,
        sale.shippingAddress ?? null,
        sale.orderId ?? null,
        Math.max(0, Math.floor(Number(sale.lineTotalCents) || qty * priceCents)),
      ],
    );
  }
  return rows.length;
}

async function importCatalog(dir: string) {
  const rows = readJson<any[]>(dir, "catalog.json", []);
  for (const item of rows) {
    if (!item?.id || !item?.title) continue;
    await dbQuery(
      `INSERT INTO catalog (id, title, price_cents, image_url, enabled, tags, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         price_cents = EXCLUDED.price_cents,
         image_url = EXCLUDED.image_url,
         enabled = EXCLUDED.enabled,
         tags = EXCLUDED.tags,
         updated_at = now()`,
      [
        String(item.id),
        String(item.title),
        Math.max(0, Math.floor(Number(item.priceCents) || 0)),
        typeof item.imageUrl === "string" ? item.imageUrl : null,
        item.enabled !== false,
        Array.isArray(item.tags) ? item.tags : [],
      ],
    );
  }
  return rows.length;
}

async function importVault(dir: string) {
  const rows = readJson<any[]>(dir, "vault.json", []);
  for (const record of rows) {
    if (!record?.productId) continue;
    await dbQuery(
      `INSERT INTO vault_records (product_id, saves, releases, pending_release, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (product_id) DO UPDATE SET
         saves = EXCLUDED.saves,
         releases = EXCLUDED.releases,
         pending_release = EXCLUDED.pending_release,
         updated_at = now()`,
      [
        String(record.productId),
        Array.isArray(record.saves) ? record.saves : [],
        Array.isArray(record.releases) ? record.releases : [],
        record.pendingRelease ?? null,
      ],
    );
  }
  return rows.length;
}

async function importInventoryState(dir: string) {
  const state = readJson<Record<string, unknown> | null>(dir, "inventory-state.json", null);
  if (!state) return 0;
  await dbQuery(
    `INSERT INTO inventory_state (id, state, updated_at)
     VALUES ('default', $1, now())
     ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
    [state],
  );
  return 1;
}

async function main() {
  if (!dbEnabled) {
    throw new Error("DATABASE_URL is required to import JSON data");
  }
  const dir = path.resolve(argValue("--dir") ?? process.env.DATA_DIR ?? "data");
  await dbQuery(schemaSql);
  const counts = {
    users: await importUsers(dir),
    sales: await importSales(dir),
    catalog: await importCatalog(dir),
    vaultRecords: await importVault(dir),
    inventoryState: await importInventoryState(dir),
  };
  console.log(`Imported JSON data from ${dir}`);
  console.table(counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
