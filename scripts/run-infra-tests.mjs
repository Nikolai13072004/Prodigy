// Запуск инфра-тестов (репозитории против настоящей БД).
//
// Отдельно от unit-прогона: поднимается ВРЕМЕННАЯ SQLite-база (свежая схема через
// `prisma db push`), в неё указывает `DATABASE_URL`, поэтому модульный `@/lib/prisma`
// автоматически работает с ней — инъекция клиента в репозитории не нужна.
//
// `tsconfig.infra.json` заглушает `server-only` (пакета нет в node_modules — его
// подменяет Next в сборке), иначе импорт репозитория (`import "server-only"`) упал бы.

import { spawn, spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
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

const dbFile = path.join(os.tmpdir(), `lms-infra-${process.pid}-${Date.now()}.db`);
const dbUrl = `file:${dbFile.replace(/\\/g, "/")}`;
const env = { ...process.env, DATABASE_URL: dbUrl };

function cleanup() {
  try {
    rmSync(dbFile, { force: true });
    rmSync(`${dbFile}-journal`, { force: true });
  } catch {
    /* ignore */
  }
}

console.log(`run-infra-tests: временная БД — ${dbFile}`);
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

// `--test-concurrency=1` — инфра-тесты пишут в ОДНУ общую SQLite; параллельный прогон
// файлов даёт гонки (глобальные count/deleteMany пересекаются между файлами) и SQLITE_BUSY.
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
