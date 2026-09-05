// Одноразовый перенос данных SQLite → PostgreSQL (ADR-014, шаг 5).
//
// Читает из SQLite (SOURCE_DATABASE_URL, по умолчанию file:./prisma/dev.db) и
// пишет в PostgreSQL (TARGET_DATABASE_URL, обязателен). Порядок копирования
// выводится топологически из DMMF (родители по FK — раньше детей), поэтому
// хардкод порядка моделей не нужен и он не разъедется со схемой.
//
// После переезда (schema.prisma уже `provider = "postgresql"`) ДЕФОЛТНЫЙ
// @prisma/client — это PostgreSQL-приёмник. Источник-SQLite генерируется в
// ОТДЕЛЬНЫЙ output (node_modules/.prisma-migrate-sqlite/client) из временной
// копии схемы с `provider = "sqlite"` — оба клиента живут в одном процессе.
//
// Запуск (при поднятом целевом PG со схемой, накатанной migrate deploy):
//   TARGET_DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public" \
//     node scripts/migrate-sqlite-to-postgres.mjs [--push] [--truncate]
//
//   --push      прогнать `prisma db push` целевой схемы перед копированием
//               (для чистой/тестовой БД; в проде схему накатывает migrate deploy).
//   --truncate  очистить целевые таблицы перед копированием (идемпотентный повтор).
//
// cuid-первичные ключи копируются как есть (автоинкремента нет) — коллизий нет.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const isWindows = process.platform === "win32";
const bin = (name) => path.join("node_modules", ".bin", isWindows ? `${name}.cmd` : name);

// Абсолютный путь: относительные file:-URL Prisma резолвит относительно каталога
// схемы (prisma/), а не cwd — абсолютный однозначен.
const SOURCE =
  process.env.SOURCE_DATABASE_URL ||
  `file:${path.resolve("prisma/dev.db").replace(/\\/g, "/")}`;
const TARGET = process.env.TARGET_DATABASE_URL;
const DO_PUSH = process.argv.includes("--push");
const DO_TRUNCATE = process.argv.includes("--truncate");
const BATCH = 1000;

if (!TARGET || !/^postgres(?:ql)?:\/\//i.test(TARGET)) {
  console.error("migrate: нужен TARGET_DATABASE_URL=postgresql://...");
  process.exit(1);
}
if (!/^file:/i.test(SOURCE)) {
  console.error("migrate: SOURCE_DATABASE_URL должен быть file:... (SQLite-источник)");
  process.exit(1);
}

const SQLITE_OUTPUT = path.resolve("node_modules/.prisma-migrate-sqlite/client");
const SQLITE_SCHEMA = path.join("prisma", "schema.migrate-sqlite.prisma");

// Источник — SQLite-клиент в отдельный output из копии схемы с provider = "sqlite".
function generateSqliteClient() {
  const base = readFileSync("prisma/schema.prisma", "utf8")
    .replace(/provider = "postgresql"/, 'provider = "sqlite"')
    .replace(
      /generator client \{[\s\S]*?\}/,
      `generator client {\n  provider = "prisma-client-js"\n  output   = "${SQLITE_OUTPUT.replace(/\\/g, "/")}"\n}`,
    );
  writeFileSync(SQLITE_SCHEMA, base);
  const gen = spawnSync(bin("prisma"), ["generate", "--schema", SQLITE_SCHEMA], {
    stdio: "inherit",
    shell: isWindows,
  });
  if (gen.status !== 0) throw new Error("prisma generate (sqlite) упал");
}

// Приёмник — целевая PG-схема (дефолтная schema.prisma, provider = postgresql).
function pushTargetSchema() {
  const push = spawnSync(
    bin("prisma"),
    ["db", "push", "--accept-data-loss", "--skip-generate"],
    { stdio: "inherit", shell: isWindows, env: { ...process.env, DATABASE_URL: TARGET } },
  );
  if (push.status !== 0) throw new Error("prisma db push (postgres) упал");
}

// Топологический порядок моделей: модель зависит от тех, на кого ссылается её FK
// (relationFromFields непусты). Родители — раньше. Самоссылки игнорируются.
function topoOrder(models) {
  const byName = new Map(models.map((m) => [m.name, m]));
  const deps = new Map();
  for (const m of models) {
    const set = new Set();
    for (const f of m.fields) {
      if (f.relationFromFields && f.relationFromFields.length > 0 && f.type !== m.name) {
        if (byName.has(f.type)) set.add(f.type);
      }
    }
    deps.set(m.name, set);
  }
  const ordered = [];
  const done = new Set();
  const visiting = new Set();
  const visit = (name) => {
    if (done.has(name)) return;
    if (visiting.has(name)) {
      // Цикл по опциональным FK (напр. взаимные ссылки) — разрываем: пишем как есть,
      // необязательные ссылки допускают null и будут заполнены после вставки родителя.
      return;
    }
    visiting.add(name);
    for (const dep of deps.get(name) ?? []) visit(dep);
    visiting.delete(name);
    done.add(name);
    ordered.push(name);
  };
  for (const m of models) visit(m.name);
  return ordered;
}

const delegateName = (modelName) => modelName.charAt(0).toLowerCase() + modelName.slice(1);

async function main() {
  console.log("migrate: генерирую SQLite-клиент источника…");
  generateSqliteClient();
  if (DO_PUSH) {
    console.log("migrate: db push целевой схемы…");
    pushTargetSchema();
  }

  // Дефолтный клиент — PostgreSQL-приёмник; источник — сгенерированный SQLite.
  const { PrismaClient: PgClient, Prisma } = require("@prisma/client");
  const { PrismaClient: SqliteClient } = require(SQLITE_OUTPUT);

  const src = new SqliteClient({ datasources: { db: { url: SOURCE } } });
  const dst = new PgClient({ datasources: { db: { url: TARGET } } });

  const models = Prisma.dmmf.datamodel.models;
  const order = topoOrder(models);
  console.log(`migrate: моделей — ${order.length}, порядок вычислен`);

  const summary = [];
  try {
    if (DO_TRUNCATE) {
      console.log("migrate: очищаю целевые таблицы (обратный порядок)…");
      for (const name of [...order].reverse()) {
        await dst[delegateName(name)].deleteMany();
      }
    }

    for (const name of order) {
      const delegate = delegateName(name);
      const rows = await src[delegate].findMany();
      let written = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const res = await dst[delegate].createMany({ data: chunk });
        written += res.count;
      }
      const dstCount = await dst[delegate].count();
      const ok = dstCount === rows.length;
      summary.push({ model: name, source: rows.length, written, target: dstCount, ok });
      console.log(`  ${ok ? "✓" : "✗"} ${name}: ${rows.length} → ${dstCount}`);
    }
  } finally {
    await src.$disconnect();
    await dst.$disconnect();
  }

  const failed = summary.filter((s) => !s.ok);
  console.log(`\nmigrate: всего перенесено строк — ${summary.reduce((a, s) => a + s.target, 0)}`);
  if (failed.length > 0) {
    console.error(`migrate: РАСХОЖДЕНИЕ по ${failed.length} моделям:`, failed.map((f) => f.model).join(", "));
    process.exit(1);
  }
  console.log("migrate: сверка count по всем моделям — ОК");
}

main()
  .catch((error) => {
    console.error("migrate: ошибка —", error?.message ?? error);
    process.exit(1);
  })
  .finally(() => {
    try {
      rmSync(SQLITE_SCHEMA, { force: true });
    } catch {
      /* ignore */
    }
  });
