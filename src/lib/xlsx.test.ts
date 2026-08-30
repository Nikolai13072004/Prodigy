import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";
import { buildXlsxWorkbook } from "./xlsx";

// Генерация .xlsx (deflate-zip с CRC32). Проверяем сквозь распаковку архива:
// структуру, экранирование XML, числовые ячейки и пропуск пустых.

// Минимальный ридer ZIP: находит запись по имени и распаковывает (метод 8) или отдаёт как есть.
function readZipEntry(buffer: Buffer, entryName: string): string | null {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  assert.notEqual(eocd, -1, "не найден конец ZIP");
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  const cdEnd = cdOffset + buffer.readUInt32LE(eocd + 12);

  let offset = cdOffset;
  while (offset < cdEnd) {
    const method = buffer.readUInt16LE(offset + 10);
    const compSize = buffer.readUInt32LE(offset + 20);
    const fnl = buffer.readUInt16LE(offset + 28);
    const extra = buffer.readUInt16LE(offset + 30);
    const comment = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + fnl);

    if (name === entryName) {
      const localFnl = buffer.readUInt16LE(localOffset + 26);
      const localExtra = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localFnl + localExtra;
      const compressed = buffer.subarray(dataStart, dataStart + compSize);
      return (method === 8 ? inflateRawSync(compressed) : compressed).toString("utf8");
    }
    offset += 46 + fnl + extra + comment;
  }
  return null;
}

test("возвращает ZIP-архив (сигнатура PK) со стандартными частями OOXML", () => {
  const buffer = buildXlsxWorkbook({ sheetName: "Лист", rows: [["A"]] });
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b); // "PK"
  for (const part of [
    "[Content_Types].xml",
    "xl/workbook.xml",
    "xl/worksheets/sheet1.xml",
    "docProps/core.xml",
  ]) {
    assert.notEqual(readZipEntry(buffer, part), null, `нет части: ${part}`);
  }
});

test("ячейки листа: текст с экранированием, числа, пропуск пустых", () => {
  const buffer = buildXlsxWorkbook({
    sheetName: "Данные",
    rows: [
      ["Имя", "Балл"],
      ["Иван <b> & \"Гроза\"", 95],
      ["", null, "хвост"],
      [0],
    ],
  });
  const sheet = readZipEntry(buffer, "xl/worksheets/sheet1.xml")!;

  assert.match(sheet, /<c r="A1" t="inlineStr"><is><t xml:space="preserve">Имя<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="B2"><v>95<\/v><\/c>/, "число без inlineStr");
  assert.match(sheet, /Иван &lt;b&gt; &amp; &quot;Гроза&quot;/, "спецсимволы экранированы");
  // пустые ячейки A3 и B3 пропущены, но C3 присутствует
  assert.doesNotMatch(sheet, /r="A3"/);
  assert.doesNotMatch(sheet, /r="B3"/);
  assert.match(sheet, /<c r="C3" t="inlineStr">/);
  assert.match(sheet, /<c r="A4"><v>0<\/v><\/c>/, "ноль отображается");
});

test("широкая строка: 27-й столбец получает ссылку AA", () => {
  const row = Array.from({ length: 27 }, (_unused, index) => `c${index}`);
  const sheet = readZipEntry(buildXlsxWorkbook({ sheetName: "W", rows: [row] }), "xl/worksheets/sheet1.xml")!;
  assert.match(sheet, /r="AA1"/);
});

test("имя листа: запрещённые символы заменяются пробелом", () => {
  const workbook = readZipEntry(
    buildXlsxWorkbook({ sheetName: "Отчёт*/Q1", rows: [["x"]] }),
    "xl/workbook.xml",
  )!;
  assert.match(workbook, /<sheet name="Отчёт {2}Q1"/);
});

test("имя листа: амперсанд экранируется, пустое имя → Sheet1", () => {
  const withAmp = readZipEntry(buildXlsxWorkbook({ sheetName: "P&L", rows: [["x"]] }), "xl/workbook.xml")!;
  assert.match(withAmp, /name="P&amp;L"/);

  const empty = readZipEntry(buildXlsxWorkbook({ sheetName: "   ", rows: [["x"]] }), "xl/workbook.xml")!;
  assert.match(empty, /name="Sheet1"/);
});

test("createdAt попадает в core.xml как ISO-метка", () => {
  const createdAt = new Date("2026-08-25T09:30:00.000Z");
  const core = readZipEntry(buildXlsxWorkbook({ sheetName: "S", rows: [["x"]], createdAt }), "docProps/core.xml")!;
  assert.match(core, /2026-08-25T09:30:00\.000Z/);
});
