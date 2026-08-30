import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSingleChoiceQuestionsMarkdown,
  parseSingleChoiceQuestionsFromDocx,
  type ImportedSingleChoiceQuestion,
} from "./quiz-docx-import";

// Импорт вопросов с одиночным выбором из DOCX и сборка markdown.
// Для парсера собираем минимальный ZIP со «stored»-записью word/document.xml —
// метод сжатия 0, поэтому deflate не нужен, а ридер читает как настоящий .docx.

function para(text: string, opts: { style?: string; bold?: boolean } = {}) {
  const style = opts.style ? `<w:pPr><w:pStyle w:val="${opts.style}"/></w:pPr>` : "";
  const rpr = opts.bold ? "<w:rPr><w:b/></w:rPr>" : "";
  return `<w:p>${style}<w:r>${rpr}<w:t>${text}</w:t></w:r></w:p>`;
}

function makeDocx(paragraphs: string[]): Buffer {
  const documentXml = `<w:document><w:body>${paragraphs.join("")}</w:body></w:document>`;
  const name = Buffer.from("word/document.xml", "utf8");
  const data = Buffer.from(documentXml, "utf8");

  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0); // сигнатура локального заголовка
  local.writeUInt16LE(0, 8); // метод: stored
  local.writeUInt32LE(data.length, 18); // сжатый размер
  local.writeUInt32LE(data.length, 22); // исходный размер
  local.writeUInt16LE(name.length, 26); // длина имени
  name.copy(local, 30);
  const localAndData = Buffer.concat([local, data]);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0); // сигнатура центрального каталога
  central.writeUInt16LE(0, 10); // метод
  central.writeUInt32LE(data.length, 20); // сжатый размер
  central.writeUInt32LE(data.length, 24); // исходный размер
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42); // смещение локального заголовка
  name.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // сигнатура конца каталога
  eocd.writeUInt16LE(1, 8); // записей на диске
  eocd.writeUInt16LE(1, 10); // всего записей
  eocd.writeUInt32LE(central.length, 12); // размер каталога
  eocd.writeUInt32LE(localAndData.length, 16); // смещение каталога

  return Buffer.concat([localAndData, central, eocd]);
}

// ---------------------------------------------- buildSingleChoiceQuestionsMarkdown

test("markdown: нумерация, выделение верного варианта и заголовок по умолчанию", () => {
  const md = buildSingleChoiceQuestionsMarkdown([
    { prompt: "Столица Франции?", options: ["Лондон", "Париж"], correctIndex: 1 },
  ]);
  assert.equal(
    md,
    "# Импортированные вопросы\n\n## 1. Столица Франции?\n\n- Лондон\n- **Париж**\n",
  );
});

test("markdown: звёздочки в тексте экранируются, заголовок настраивается", () => {
  const md = buildSingleChoiceQuestionsMarkdown(
    [{ prompt: "2*2", options: ["3", "2*2"], correctIndex: 1 }],
    "Тест",
  );
  assert.match(md, /^# Тест\n/);
  assert.match(md, /- \*\*2\\\*2\*\*/, "верный вариант со звёздочкой экранирован и выделен");
});

test("markdown: пустой список вопросов → только заголовок", () => {
  assert.equal(buildSingleChoiceQuestionsMarkdown([]), "# Импортированные вопросы\n");
});

// ---------------------------------------------- parseSingleChoiceQuestionsFromDocx

test("парсинг по знакам вопроса: prompt заканчивается на ?, верный — жирный", () => {
  const docx = makeDocx([
    para("Столица Франции?"),
    para("Париж", { bold: true }),
    para("Лондон"),
    para("Сколько будет 2+2?"),
    para("3"),
    para("4", { bold: true }),
  ]);
  const result = parseSingleChoiceQuestionsFromDocx(docx);
  assert.deepEqual(result, [
    { prompt: "Столица Франции?", options: ["Париж", "Лондон"], correctIndex: 0 },
    { prompt: "Сколько будет 2+2?", options: ["3", "4"], correctIndex: 1 },
  ] satisfies ImportedSingleChoiceQuestion[]);
});

test("парсинг по стилю вариантов: варианты в одном стиле абзаца", () => {
  const opt = { style: "ListParagraph" as const };
  const docx = makeDocx([
    para("Вопрос 1"),
    para("Москва", { ...opt, bold: true }),
    para("Париж", opt),
    para("Вопрос 2"),
    para("Один", opt),
    para("Два", { ...opt, bold: true }),
  ]);
  const result = parseSingleChoiceQuestionsFromDocx(docx);
  assert.deepEqual(result, [
    { prompt: "Вопрос 1", options: ["Москва", "Париж"], correctIndex: 0 },
    { prompt: "Вопрос 2", options: ["Один", "Два"], correctIndex: 1 },
  ]);
});

test("вопрос без единственного верного варианта пропускается", () => {
  // два жирных варианта → неоднозначно, вопрос не импортируется
  const docx = makeDocx([
    para("Неоднозначный вопрос?"),
    para("A", { bold: true }),
    para("B", { bold: true }),
  ]);
  assert.deepEqual(parseSingleChoiceQuestionsFromDocx(docx), []);
});

test("не-DOCX буфер отклоняется с понятной ошибкой", () => {
  assert.throws(() => parseSingleChoiceQuestionsFromDocx(Buffer.from("это не docx")), /не похож на DOCX/);
});
