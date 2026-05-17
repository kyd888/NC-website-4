import pg from "pg";
import dotenv from "dotenv";

const { Pool } = pg;

dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();

function shouldUseSsl(connectionString: string) {
  if (process.env.PGSSLMODE === "disable") return false;
  if (process.env.PGSSL === "false") return false;
  return !/localhost|127\.0\.0\.1/i.test(connectionString);
}

export const dbEnabled = Boolean(databaseUrl);

export const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
    })
  : null;

export async function dbQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }
  return pool.query<T>(text, params);
}

export function logDbError(scope: string, error: unknown) {
  console.error(`[db] ${scope}`, error);
}

export async function closeDb() {
  if (pool) {
    await pool.end();
  }
}
