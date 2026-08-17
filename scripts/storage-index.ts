// Разовая индексация уже лежащих в хранилище файлов.
//
// Зачем: дедупликация при загрузке ищет совпадение по записям `StorageFile`.
// Файлы, попавшие на диск до появления дедупликации (или после восстановления
// тома из бэкапа), записей не имеют — приложение о них не знает, и повторная
// загрузка того же содержимого снова создаёт копию.
//
// Проход считает sha256 каждого файла и заполняет `StorageFile`, а заодно
// показывает, сколько места занято лишними копиями.
//
// Скрипт НИЧЕГО НЕ УДАЛЯЕТ и удалять не должен: на один файл могут ссылаться
// материалы разных курсов, и удаление возможно только после подсчёта ссылок в
// доменных сущностях, а не по одному лишь совпадению хеша.
//
// Запуск:
//   npm run storage:index              -- обе области
//   npm run storage:index -- --area=uploads
//   npm run storage:index -- --dry-run -- только посчитать, без записи в БД

import prisma from "@/lib/prisma";
import { storage, type StorageArea } from "@/lib/storage";
import { indexStorageFile, normalizeExtension } from "@/lib/storage/dedup";
import { pluralizeCopies, summarizeIndexResults, type IndexedFile } from "@/lib/storage/index-report";

const ALL_AREAS: StorageArea[] = ["uploads", "branding"];

function parseArgs(argv: string[]) {
  const areaArg = argv.find((arg) => arg.startsWith("--area="))?.split("=")[1];
  const dryRun = argv.includes("--dry-run");

  if (areaArg && !ALL_AREAS.includes(areaArg as StorageArea)) {
    throw new Error(`Неизвестная область: ${areaArg}. Допустимо: ${ALL_AREAS.join(", ")}`);
  }

  return { areas: areaArg ? [areaArg as StorageArea] : ALL_AREAS, dryRun };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

async function indexArea(area: StorageArea, dryRun: boolean): Promise<IndexedFile[]> {
  const entries = await storage.list(area);
  console.info(`[${area}] файлов на диске: ${entries.length}`);

  const indexed: IndexedFile[] = [];
  // В режиме --dry-run записи не создаются, поэтому совпадения не с чем искать
  // в базе: файлы, встреченные в этом проходе, запоминаются в памяти.
  const seenFiles = new Map<string, string>();
  let skippedCollisions = 0;

  for (const [position, entry] of entries.entries()) {
    if (position > 0 && position % 200 === 0) {
      console.info(`[${area}] обработано ${position}/${entries.length}`);
    }

    try {
      // `StorageFile.key` уникален глобально, а не в пределах области. Если тот
      // же относительный ключ уже записан за другой областью, запись про неё
      // была бы молча перезаписана: отчёт отрапортовал бы об индексации обоих
      // файлов, а первая область осталась бы непроиндексированной. Такой случай
      // пропускаем явно — чинить это должна уникальность по (area, key) в схеме,
      // а не проход по файлам.
      const foreign = await prisma.storageFile.findUnique({ where: { key: entry.key } });
      if (foreign && foreign.area !== area) {
        console.error(
          `[${area}] пропущен ${entry.key}: тот же ключ уже принадлежит области "${foreign.area}"`
        );
        skippedCollisions += 1;
        continue;
      }

      const result = dryRun
        ? await inspectWithoutWriting(area, entry.key, seenFiles)
        : await indexStorageFile(area, entry.key, { extension: null });

      indexed.push({
        key: entry.key,
        sizeBytes: result.sizeBytes,
        sha256: result.sha256,
        duplicateOf: result.deduplicated ? result.object.key : null,
      });
    } catch (error) {
      // Один нечитаемый файл не должен обрывать проход по тысячам остальных.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${area}] пропущен ${entry.key}: ${message}`);
    }
  }

  if (skippedCollisions > 0) {
    console.error(`[${area}] пропущено из-за конфликта ключей: ${skippedCollisions}`);
  }

  return indexed;
}

/**
 * Режим `--dry-run`: считает хеш и ищет совпадение, но ничего не записывает.
 * Нужен, чтобы оценить масштаб дублей на проде, не меняя данные.
 *
 * Условие совпадения повторяет боевое из `dedup.ts` — `(area, sha256, размер,
 * нормализованное расширение)`, а не один лишь хеш. Иначе оценка расходилась бы
 * с реальностью: файлы с одинаковыми байтами, но разными расширениями боевой
 * проход считает разными, а отчёт объявил бы их дубликатами.
 *
 * Совпадение ищется и среди существующих записей, и среди файлов этого же
 * прохода: без второго источника режим ничего бы не нашёл на пустой таблице —
 * а это ровно тот случай, ради которого он нужен. Запись, указывающая на
 * исчезнувший файл, кандидатом не считается — так же, как в боевом пути.
 */
async function inspectWithoutWriting(
  area: StorageArea,
  key: string,
  seenFiles: Map<string, string>
) {
  const { createHash } = await import("crypto");
  const hash = createHash("sha256");
  let sizeBytes = 0;

  for await (const chunk of storage.stream(area, key)) {
    const buffer = chunk as Buffer;
    hash.update(buffer);
    sizeBytes += buffer.byteLength;
  }

  const sha256 = hash.digest("hex");
  const extension = normalizeExtension(null, key);
  const dedupKey = `${area}:${sha256}:${sizeBytes}:${extension}`;

  const recorded = await prisma.storageFile.findUnique({
    where: {
      area_sha256_sizeBytes_extension: {
        area,
        sha256,
        sizeBytes: BigInt(sizeBytes),
        extension,
      },
    },
  });

  const recordedKey = recorded && (await fileStillOnDisk(area, recorded.key)) ? recorded.key : null;
  const originalKey = recordedKey ?? seenFiles.get(dedupKey) ?? null;

  if (!originalKey) {
    seenFiles.set(dedupKey, key);
  }

  return {
    sha256,
    sizeBytes,
    deduplicated: Boolean(originalKey && originalKey !== key),
    object: { key: originalKey ?? key },
  };
}

async function fileStillOnDisk(area: StorageArea, key: string) {
  try {
    return (await storage.stat(area, key)).isFile();
  } catch {
    return false;
  }
}

async function main() {
  const { areas, dryRun } = parseArgs(process.argv.slice(2));

  if (dryRun) {
    console.info("Режим --dry-run: записи в StorageFile не создаются.\n");
  }

  const collected: IndexedFile[] = [];
  for (const area of areas) {
    collected.push(...(await indexArea(area, dryRun)));
  }

  const report = summarizeIndexResults(collected);

  console.info("\n=== Итог ===");
  console.info(`Файлов обработано:     ${report.total}`);
  console.info(`Уникальных:            ${report.indexed}`);
  console.info(`Лишних копий:          ${report.duplicates}`);
  console.info(`Уникальные данные:     ${formatBytes(report.uniqueBytes)}`);
  console.info(`Занято копиями:        ${formatBytes(report.reclaimableBytes)}`);

  if (report.groups.length > 0) {
    console.info("\nТоп повторяющегося содержимого:");
    for (const group of report.groups.slice(0, 10)) {
      console.info(`  ${pluralizeCopies(group.copies)} × ${group.original} → ${formatBytes(group.reclaimableBytes)}`);
    }
  }

  console.info(
    "\nФайлы не удалялись. Удаление возможно только после подсчёта ссылок " +
      "в материалах курсов — совпадения хеша для этого недостаточно."
  );

  await prisma.$disconnect();
}

void main();
