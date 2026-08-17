import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(rootDir, "prisma");
const databaseUrl = process.env.DATABASE_URL?.trim();
const requiredLogin = process.env.DB_CHECK_REQUIRED_LOGIN ?? "student123";
const minUsers = Number(process.env.DB_CHECK_MIN_USERS ?? "1");
const minCourses = Number(process.env.DB_CHECK_MIN_COURSES ?? "1");

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function resolveSqlitePath(url) {
  if (!url?.startsWith("file:")) return null;

  const rawPath = url.slice("file:".length).split("?")[0];
  if (!rawPath || rawPath === ":memory:") return null;

  const decodedPath = decodeURIComponent(rawPath);
  return path.isAbsolute(decodedPath) ? decodedPath : path.resolve(schemaDir, decodedPath);
}

const dbPath = resolveSqlitePath(databaseUrl);

if (!dbPath) {
  fail(`DB check failed: DATABASE_URL must point to a SQLite file, got ${databaseUrl || "<empty>"}`);
  process.exit();
}

if (!fs.existsSync(dbPath)) {
  fail(`DB check failed: database file does not exist: ${dbPath}`);
  process.exit();
}

const dbStat = fs.statSync(dbPath);
if (dbStat.size === 0) {
  fail(`DB check failed: database file is empty: ${dbPath}`);
  process.exit();
}

const prisma = new PrismaClient();

try {
  const [usersCount, coursesCount, requiredUser, courseColumns] = await Promise.all([
    prisma.user.count(),
    prisma.course.count(),
    requiredLogin
      ? prisma.user.findUnique({
          where: { login: requiredLogin },
          select: { login: true },
        })
      : Promise.resolve(null),
    prisma.$queryRawUnsafe(`PRAGMA table_info("Course")`),
  ]);

  const columnNames = new Set(courseColumns.map((column) => String(column.name)));
  const problems = [];

  if (usersCount < minUsers) {
    problems.push(`expected at least ${minUsers} user(s), found ${usersCount}`);
  }

  if (coursesCount < minCourses) {
    problems.push(`expected at least ${minCourses} course(s), found ${coursesCount}`);
  }

  if (requiredLogin && !requiredUser) {
    problems.push(`required user "${requiredLogin}" is missing`);
  }

  if (!columnNames.has("tagsJson")) {
    problems.push(`Course.tagsJson column is missing`);
  }

  console.log(`DB: ${dbPath}`);
  console.log(`Users: ${usersCount}`);
  console.log(`Courses: ${coursesCount}`);
  console.log(`Required user: ${requiredLogin ? (requiredUser ? `${requiredLogin} exists` : `${requiredLogin} missing`) : "disabled"}`);

  if (problems.length > 0) {
    fail(`DB check failed:\n- ${problems.join("\n- ")}`);
  } else {
    console.log("Schema: OK");
  }
} catch (error) {
  fail(`DB check failed: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await prisma.$disconnect();
}
