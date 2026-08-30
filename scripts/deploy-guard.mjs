// Guard стратегии применения схемы БД.
//
// Прод-база исторически накатывалась через `prisma db push` и не имеет таблицы
// `_prisma_migrations`, поэтому `prisma migrate deploy` падает с P3005. Так как
// CMD в Dockerfile собран через `&&`, приложение при этом не стартует вообще:
// контейнер уходит в рестарт-луп, healthcheck метит сервис unhealthy и следом
// не поднимаются воркеры (depends_on: condition: service_healthy).
//
// При 62 миграциях в prisma/migrations `db push` выглядит как очевидная ошибка,
// поэтому попытка «починить» его повторяется. Guard существует, чтобы такая
// правка падала в CI, а не на выкатке.
//
// Обоснование и процедура снятия: docs/architecture/010-database-migration-strategy.md
// Снимать guard следует тем же MR, которым выполняется baseline прод-базы.

import { readFileSync } from "node:fs";

/**
 * Проверяет текст Dockerfile на разрешённую стратегию применения схемы.
 *
 * Проверка не строчная: комментарии отбрасываются (в них это же правило и
 * объясняется), переносы строк схлопываются — иначе `CMD`, разбитый на
 * несколько строк, обошёл бы guard.
 */
function stripCommentsAndJoin(dockerfileText) {
  const withoutComments = dockerfileText
    .split("\n")
    .map((line) => line.split("#", 1)[0])
    .join("\n");
  return withoutComments.replace(/\\\s*\n/g, " ");
}

/**
 * Разбирает Dockerfile на стадии: каждая начинается с FROM.
 * Для стадии запоминаем её базу, имя (AS ...) и собственную CMD, если есть.
 */
function parseStages(joinedText) {
  const stages = [];

  for (const line of joinedText.split("\n")) {
    const from = line.match(/^\s*FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i);
    if (from) {
      stages.push({ base: from[1], name: from[2]?.toLowerCase() ?? null, cmd: null });
      continue;
    }

    const cmd = line.match(/^\s*CMD\s+(.*)$/i);
    if (cmd && stages.length > 0) {
      stages[stages.length - 1].cmd = cmd[1].replace(/\s+/g, " ");
    }
  }

  return stages;
}

/**
 * Команда, с которой стартует итоговый образ.
 *
 * Берётся из ПОСЛЕДНЕЙ стадии, а не последняя CMD в файле: Docker наследует CMD
 * от базового образа стадии, поэтому команда builder-стадии в итоговый образ не
 * попадает. Если у финальной стадии своей CMD нет, она наследует её от базы —
 * это удаётся установить, только когда база тоже описана в этом файле.
 * В остальных случаях команда неизвестна, и guard обязан не пропускать.
 */
function extractStartupCommand(joinedText) {
  const stages = parseStages(joinedText);
  if (stages.length === 0) return null;

  let stage = stages[stages.length - 1];
  const visited = new Set();

  while (stage) {
    if (stage.cmd) return stage.cmd;

    const baseName = stage.base.toLowerCase();
    if (visited.has(baseName)) return null;
    visited.add(baseName);

    stage = stages.find((candidate) => candidate.name === baseName) ?? null;
  }

  return null;
}

export function checkMigrationStrategy(dockerfileText) {
  const joined = stripCommentsAndJoin(dockerfileText);
  const normalized = joined.replace(/\s+/g, " ");

  // Запрет действует на весь файл: `migrate deploy` не должен появляться нигде.
  if (/prisma\s+migrate\s+deploy/i.test(normalized)) {
    return {
      ok: false,
      reason:
        "в Dockerfile обнаружен `prisma migrate deploy`. Прод-база создана через `db push` " +
        "и не имеет истории миграций — деплой упадёт с P3005, контейнер уйдёт в рестарт-луп. " +
        "Сначала baseline прод-базы, затем снятие этого guard'а.",
    };
  }

  // А вот наличие `db push` проверяется строго в стартовой команде: инвариант в
  // том, что схема применяется при старте контейнера. Тот же `db push` в
  // builder-стадии на прод-базу не влияет, и релиз со схемным изменением уехал
  // бы на устаревшую базу.
  const startupCommand = extractStartupCommand(joined);

  if (!startupCommand) {
    return { ok: false, reason: "в Dockerfile нет стартовой команды CMD." };
  }

  if (!/prisma\s+db\s+push/i.test(startupCommand)) {
    return {
      ok: false,
      reason:
        "стартовая команда Dockerfile не применяет схему через `prisma db push` — " +
        "контейнер поднимется на устаревшей базе.",
    };
  }

  return { ok: true };
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith("deploy-guard.mjs");

if (isDirectRun) {
  const result = checkMigrationStrategy(readFileSync("Dockerfile", "utf8"));

  if (!result.ok) {
    console.error(`deploy-guard: ${result.reason}`);
    console.error("См. docs/architecture/010-database-migration-strategy.md");
    process.exit(1);
  }

  console.log("deploy-guard OK: схема применяется через `prisma db push`");
}
