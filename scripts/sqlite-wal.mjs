import "dotenv/config";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(rootDir, "prisma");
const databaseUrl = process.env.DATABASE_URL?.trim();

function resolveSqlitePath(url) {
  if (!url?.startsWith("file:")) return null;

  const rawPath = url.slice("file:".length).split("?")[0];
  if (!rawPath || rawPath === ":memory:") return null;

  const decodedPath = decodeURIComponent(rawPath);
  return path.isAbsolute(decodedPath) ? decodedPath : path.resolve(schemaDir, decodedPath);
}

const dbPath = resolveSqlitePath(databaseUrl);

if (!dbPath) {
  console.error(`SQLite WAL setup failed: DATABASE_URL must point to a SQLite file, got ${databaseUrl || "<empty>"}`);
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const result = await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  const mode = Array.isArray(result) && result[0] ? Object.values(result[0])[0] : "unknown";
  console.log(`SQLite WAL: ${dbPath} journal_mode=${mode}`);
} catch (error) {
  console.error(`SQLite WAL setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
