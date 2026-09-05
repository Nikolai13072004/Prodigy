import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL?.trim();
const requiredLogin = process.env.DB_CHECK_REQUIRED_LOGIN ?? "admin";
const minUsers = Number(process.env.DB_CHECK_MIN_USERS ?? "1");
const minCourses = Number(process.env.DB_CHECK_MIN_COURSES ?? "1");

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!databaseUrl) {
  fail("DB check failed: DATABASE_URL is empty");
  process.exit();
}

if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  fail(`DB check failed: DATABASE_URL must be a PostgreSQL URL, got ${databaseUrl}`);
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
    prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'Course'`,
    ),
  ]);

  const columnNames = new Set(courseColumns.map((column) => String(column.column_name)));
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

  console.log(`DB: ${databaseUrl.replace(/:\/\/[^@]*@/, "://***@")}`);
  console.log(`Users: ${usersCount}`);
  console.log(`Courses: ${coursesCount}`);
  console.log(
    `Required user: ${requiredLogin ? (requiredUser ? `${requiredLogin} exists` : `${requiredLogin} missing`) : "disabled"}`,
  );

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
