export type IndexedFile = {
  key: string;
  sizeBytes: number;
  sha256: string;
  /** Ключ файла с тем же содержимым, если этот файл оказался его копией. */
  duplicateOf: string | null;
};

export type DuplicateGroup = {
  original: string;
  copies: number;
  reclaimableBytes: number;
};

export type IndexReport = {
  total: number;
  indexed: number;
  duplicates: number;
  uniqueBytes: number;
  reclaimableBytes: number;
  groups: DuplicateGroup[];
};

/** Склоняет «копия» по русским правилам: 1 копия, 2 копии, 5 копий, 11 копий. */
export function pluralizeCopies(count: number) {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;

  if (mod100 >= 11 && mod100 <= 14) return `${count} копий`;
  if (mod10 === 1) return `${count} копия`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} копии`;
  return `${count} копий`;
}

/**
 * Сводит результаты индексирующего прохода в отчёт.
 *
 * Отчёт отвечает на вопрос «сколько места освободит чистка»: `reclaimableBytes`
 * считается только по копиям — оригинал каждого содержимого остаётся на диске.
 * Само удаление здесь не выполняется и выполняться не должно: на файл могут
 * ссылаться материалы курсов, и удалять его можно только после подсчёта ссылок.
 */
export function summarizeIndexResults(files: IndexedFile[]): IndexReport {
  const groups = new Map<string, DuplicateGroup>();
  let uniqueBytes = 0;
  let reclaimableBytes = 0;
  let duplicates = 0;

  for (const file of files) {
    if (!file.duplicateOf) {
      uniqueBytes += file.sizeBytes;
      continue;
    }

    duplicates += 1;
    reclaimableBytes += file.sizeBytes;

    const group = groups.get(file.duplicateOf) ?? {
      original: file.duplicateOf,
      copies: 0,
      reclaimableBytes: 0,
    };
    group.copies += 1;
    group.reclaimableBytes += file.sizeBytes;
    groups.set(file.duplicateOf, group);
  }

  return {
    total: files.length,
    indexed: files.length - duplicates,
    duplicates,
    uniqueBytes,
    reclaimableBytes,
    groups: [...groups.values()].sort((a, b) => b.reclaimableBytes - a.reclaimableBytes),
  };
}
