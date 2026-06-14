import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../drizzle/schema";

const dbUrl = [
  process.env.DATABASE_URL,
  process.env.NEON_DATABASE_URL,
  process.env.CONNECTION_STRING,
  process.env.PLATFORM_DATABASE_URL,
].find((value) => {
  if (!value || !/^postgres(ql)?:\/\//.test(value)) return false;
  try {
    const parsed = new URL(value);
    return Boolean(parsed.hostname && parsed.hostname !== "host" && parsed.hostname !== "CLOUD_SQL_PUBLIC_IP");
  } catch {
    return false;
  }
});
const neonRestApiUrl = process.env.NEON_API_URL?.trim();
const isPostgresUrl = !!dbUrl && /^postgres(ql)?:\/\//.test(dbUrl);

if (!dbUrl) {
  console.error("[db] WARNING: DATABASE_URL is not set — database features will be unavailable");
  if (neonRestApiUrl) {
    console.error("[db] NEON_API_URL is a REST endpoint; Drizzle needs DATABASE_URL with a postgres:// or postgresql:// connection string");
  }
} else if (!isPostgresUrl) {
  console.error("[db] WARNING: DATABASE_URL is not a Postgres connection string — database features will be unavailable");
}

const sql = isPostgresUrl && dbUrl ? neon(dbUrl) : null;

export const db = sql ? drizzle(sql, { schema }) : (null as unknown as ReturnType<typeof drizzle>);
export const hasDatabase = !!sql;
