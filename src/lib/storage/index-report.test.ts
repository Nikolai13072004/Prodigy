import assert from "node:assert/strict";
import test from "node:test";
import { pluralizeCopies, summarizeIndexResults, type IndexedFile } from "./index-report";

function file(overrides: Partial<IndexedFile>): IndexedFile {
  return {
    key: "a.pptx",
    sizeBytes: 1000,
    sha256: "hash-a",
    duplicateOf: null,
    ...overrides,
  };
}

test("считает проиндексированные файлы и дубликаты раздельно", () => {
  const report = summarizeIndexResults([
    file({ key: "a.pptx", sha256: "h1" }),
    file({ key: "b.pptx", sha256: "h1", duplicateOf: "a.pptx" }),
    file({ key: "c.pdf", sha256: "h2" }),
  ]);

  assert.equal(report.total, 3);
  assert.equal(report.indexed, 2);
  assert.equal(report.duplicates, 1);
});

// Ради этого числа проход и запускается: оно показывает, сколько места
// освободит последующая чистка. Считается только по копиям — оригинал каждого
// содержимого остаётся на диске.
test("считает объём, занятый лишними копиями", () => {
  const report = summarizeIndexResults([
    file({ key: "a.pptx", sha256: "h1", sizeBytes: 16_000_000 }),
    file({ key: "b.pptx", sha256: "h1", sizeBytes: 16_000_000, duplicateOf: "a.pptx" }),
    file({ key: "c.pptx", sha256: "h1", sizeBytes: 16_000_000, duplicateOf: "a.pptx" }),
  ]);

  assert.equal(report.reclaimableBytes, 32_000_000);
  assert.equal(report.uniqueBytes, 16_000_000);
});

test("группирует дубликаты по оригиналу, крупнейшие первыми", () => {
  const report = summarizeIndexResults([
    file({ key: "small.pdf", sha256: "h2", sizeBytes: 100 }),
    file({ key: "small-copy.pdf", sha256: "h2", sizeBytes: 100, duplicateOf: "small.pdf" }),
    file({ key: "big.pptx", sha256: "h1", sizeBytes: 16_000_000 }),
    file({ key: "big-copy1.pptx", sha256: "h1", sizeBytes: 16_000_000, duplicateOf: "big.pptx" }),
    file({ key: "big-copy2.pptx", sha256: "h1", sizeBytes: 16_000_000, duplicateOf: "big.pptx" }),
  ]);

  assert.equal(report.groups.length, 2);
  assert.equal(report.groups[0].original, "big.pptx");
  assert.equal(report.groups[0].copies, 2);
  assert.equal(report.groups[0].reclaimableBytes, 32_000_000);
  assert.equal(report.groups[1].original, "small.pdf");
});

test("пустой проход даёт нулевой отчёт, а не падение", () => {
  const report = summarizeIndexResults([]);

  assert.deepEqual(report, {
    total: 0,
    indexed: 0,
    duplicates: 0,
    uniqueBytes: 0,
    reclaimableBytes: 0,
    groups: [],
  });
});

test("склоняет слово «копия» по русским правилам", () => {
  assert.equal(pluralizeCopies(1), "1 копия");
  assert.equal(pluralizeCopies(2), "2 копии");
  assert.equal(pluralizeCopies(4), "4 копии");
  assert.equal(pluralizeCopies(5), "5 копий");
  assert.equal(pluralizeCopies(11), "11 копий");
  assert.equal(pluralizeCopies(21), "21 копия");
  assert.equal(pluralizeCopies(112), "112 копий");
});
