// Запуск инфра-тестов (репозитории против настоящей БД).
//
// Два режима:
//
// 1. По умолчанию — ВРЕМЕННАЯ SQLite-база (свежая схема через `prisma db push`),
//    в неё указывает `DATABASE_URL`, поэтому модульный `@/lib/prisma`
//    автоматически работает с ней — инъекция клиента в репозитории не нужна.
//
// 2. `INFRA_DATABASE_URL=postgresql://...` — прогон против внешнего PostgreSQL
//    (например, локального docker-контейнера). Нужен для проверки
//    провайдер-независимости перед переездом на PG (ADR-014, шаг 0).
//    ВНИМАНИЕ: указанная БД пересоздаётся начисто (`db push --force-reset`) —
//    передавайте только одноразовую тестовую базу, не рабочую.
//
//    Клиент Prisma привязан к провайдеру схемы, по которой сгенерирован, поэтому
//    PG-режим временно генерирует клиент под postgres и ВОЗВРАЩАЕТ его под
//    sqlite в cleanup (в т.ч. при падении). Если процесс убить жёстко (SIGKILL),
//    клиент останется под postgres — почините `npx prisma generate`.
//
// `tsconfig.infra.json` заглушает `server-only` (пакета нет в node_modules — его
// подменяет Next в сборке), иначе импорт репозитория (`import "server-only"`) упал бы.

import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const INFRA_FILE = /\.infra\.test\.(?:ts|mts|cts)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", "coverage"]);

function collect(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collect(path.join(dir, entry.name), found);
      continue;
    }
    if (INFRA_FILE.test(entry.name)) found.push(path.join(dir, entry.name));
  }
  return found;
}

const files = collect("src").sort();
if (files.length === 0) {
  console.error("run-infra-tests: не найдено ни одного *.infra.test.*");
  process.exit(1);
}
console.log(`run-infra-tests: инфра-тестов — ${files.length}`);

const isWindows = process.platform === "win32";
const bin = (name) => path.join("node_modules", ".bin", isWindows ? `${name}.cmd` : name);

const externalUrl = process.env.INFRA_DATABASE_URL;
const usePostgres = Boolean(externalUrl) && /^postgres(?:ql)?:\/\//i.test(externalUrl);

// SQLite-режим: временный файл. PG-режим: внешний URL + временная pg-схема.
const sqliteFile = usePostgres
  ? null
  : path.join(os.tmpdir(), `lms-infra-${process.pid}-${Date.now()}.db`);
const dbUrl = usePostgres ? externalUrl : `file:${sqliteFile.replace(/\\/g, "/")}`;
// Временная pg-схема лежит РЯДОМ с рабочей (prisma/), а не в os.tmpdir: вывод
// клиента у prisma-client-js резолвится относительно каталога схемы, поэтому
// только так сгенерированный клиент попадёт в проектный node_modules.
const pgSchemaPath = usePostgres
  ? path.join("prisma", `schema.infra-pg-${process.pid}.prisma`)
  : null;
const env = { ...process.env, DATABASE_URL: dbUrl };

function cleanup() {
  if (usePostgres) {
    // Вернуть клиент под sqlite — иначе локальная разработка сломается.
    spawnSync(bin("prisma"), ["generate"], { stdio: "inherit", shell: isWindows });
    try {
      rmSync(pgSchemaPath, { force: true });
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    rmSync(sqliteFile, { force: true });
    rmSync(`${sqliteFile}-journal`, { force: true });
  } catch {
    /* ignore */
  }
}

if (usePostgres) {
  console.log(`run-infra-tests: PostgreSQL — ${externalUrl.replace(/:[^:@/]*@/, ":***@")}`);
  // Временная схема с provider = "postgresql" (рабочую prisma/schema.prisma не трогаем).
  const schema = readFileSync("prisma/schema.prisma", "utf8").replace(
    /provider = "sqlite"/,
    'provider = "postgresql"',
  );
  writeFileSync(pgSchemaPath, schema);

  const push = spawnSync(
    bin("prisma"),
    ["db", "push", "--schema", pgSchemaPath, "--force-reset", "--accept-data-loss", "--skip-generate"],
    { stdio: "inherit", shell: isWindows, env },
  );
  if (push.status !== 0) {
    cleanup();
    console.error("run-infra-tests: `prisma db push` (postgres) завершился с ошибкой");
    process.exit(push.status ?? 1);
  }
  // Клиент под postgres на время прогона.
  const gen = spawnSync(bin("prisma"), ["generate", "--schema", pgSchemaPath], {
    stdio: "inherit",
    shell: isWindows,
  });
  if (gen.status !== 0) {
    cleanup();
    console.error("run-infra-tests: `prisma generate` (postgres) завершился с ошибкой");
    process.exit(gen.status ?? 1);
  }
} else {
  console.log(`run-infra-tests: временная БД — ${sqliteFile}`);
  const push = spawnSync(bin("prisma"), ["db", "push", "--skip-generate", "--accept-data-loss"], {
    stdio: "inherit",
    shell: isWindows,
    env,
  });
  if (push.status !== 0) {
    cleanup();
    console.error("run-infra-tests: `prisma db push` завершился с ошибкой");
    process.exit(push.status ?? 1);
  }
}

// `--test-concurrency=1` — инфра-тесты пишут в ОДНУ общую БД; параллельный прогон
// файлов даёт гонки (глобальные count/deleteMany пересекаются между файлами).
const child = spawn(bin("tsx"), ["--test", "--test-concurrency=1", ...files], {
  stdio: "inherit",
  shell: isWindows,
  env: {
    ...env,
    // Инфра-конфиг заглушает `server-only` (в tsx-окружении пакета нет — его подменяет Next).
    TSX_TSCONFIG_PATH: "tsconfig.infra.json",
  },
});

child.on("error", (error) => {
  cleanup();
  console.error(`run-infra-tests: не удалось запустить tsx — ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  cleanup();
  process.exit(code ?? (signal ? 1 : 0));
});
