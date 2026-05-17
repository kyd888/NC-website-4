import dotenv from "dotenv";
import { closeDb, dbEnabled, dbQuery } from "../lib/db.js";
import { schemaSql } from "../lib/schema.js";

dotenv.config();

async function main() {
  if (!dbEnabled) {
    throw new Error("DATABASE_URL is required to run migrations");
  }
  await dbQuery(schemaSql);
  console.log("Postgres schema is ready");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
