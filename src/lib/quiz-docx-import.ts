import { inflateRawSync } from "zlib";

export type ImportedSingleChoiceQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number;
};

type DocxParagraph = {
  text: string;
  styleId: string | null;
  hasBoldText: boolean;
};

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

export function parseSingleChoiceQuestionsFromDocx(buffer: Buffer) {
  const documentXml = readDocxEntry(buffer, "word/document.xml");
  const paragraphs = parseDocumentParagraphs(documentXml);
  const questions = parseQuestionsByOptionStyle(paragraphs);

  if (questions.length > 0) return questions;

  return parseQuestionsByQuestionMarks(paragraphs);
}

export function buildSingleChoiceQuestionsMarkdown(
  questions: ImportedSingleChoiceQuestion[],
  title = "Импортированные вопросы"
) {
  const lines = [`# ${title}`, ""];

  questions.forEach((question, questionIndex) => {
    lines.push(`## ${questionIndex + 1}. ${question.prompt}`, "");
    question.options.forEach((option, optionIndex) => {
      const escaped = option.replace(/\*/g, "\\*");
      lines.push(optionIndex === question.correctIndex ? `- **${escaped}**` : `- ${escaped}`);
    });
    lines.push("");
  });

  return lines.join("\n").trimEnd() + "\n";
}

function parseQuestionsByOptionStyle(paragraphs: DocxParagraph[]) {
  const optionStyleId = detectOptionStyleId(paragraphs);
  if (!optionStyleId) return [];

  const questions: ImportedSingleChoiceQuestion[] = [];
  let prompt: string | null = null;
  let options: DocxParagraph[] = [];

  const flush = () => {
    if (!prompt || options.length < 2) {
      prompt = null;
      options = [];
      return;
    }

    const correctIndexes = options
      .map((option, index) => (option.hasBoldText ? index : -1))
      .filter((index) => index >= 0);

    if (correctIndexes.length === 1) {
      questions.push({
        prompt,
        options: options.map((option) => option.text),
        correctIndex: correctIndexes[0],
      });
    }

    prompt = null;
    options = [];
  };

  for (const paragraph of paragraphs) {
    if (paragraph.styleId === optionStyleId) {
      if (prompt) options.push(paragraph);
      continue;
    }

    flush();
    prompt = paragraph.text;
  }

  flush();

  return questions;
}

function parseQuestionsByQuestionMarks(paragraphs: DocxParagraph[]) {
  const questions: ImportedSingleChoiceQuestion[] = [];
  let index = 0;

  while (index < paragraphs.length) {
    const candidate = paragraphs[index];
    if (!looksLikeQuestion(candidate.text)) {
      index += 1;
      continue;
    }

    const options: DocxParagraph[] = [];
    let nextIndex = index + 1;

    while (nextIndex < paragraphs.length) {
      const next = paragraphs[nextIndex];
      if (options.length >= 2 && looksLikeQuestion(next.text)) break;
      options.push(next);
      nextIndex += 1;
    }

    const correctIndexes = options
      .map((option, optionIndex) => (option.hasBoldText ? optionIndex : -1))
      .filter((optionIndex) => optionIndex >= 0);

    if (options.length >= 2 && correctIndexes.length === 1) {
      questions.push({
        prompt: candidate.text,
        options: options.map((option) => option.text),
        correctIndex: correctIndexes[0],
      });
      index = nextIndex;
    } else {
      index += 1;
    }
  }

  return questions;
}

function detectOptionStyleId(paragraphs: DocxParagraph[]) {
  const stats = new Map<string, { total: number; bold: number }>();

  for (const paragraph of paragraphs) {
    if (!paragraph.styleId) continue;
    const stat = stats.get(paragraph.styleId) ?? { total: 0, bold: 0 };
    stat.total += 1;
    if (paragraph.hasBoldText) stat.bold += 1;
    stats.set(paragraph.styleId, stat);
  }

  return [...stats.entries()]
    .filter(([, stat]) => stat.total >= 4 && stat.bold >= 1 && stat.bold < stat.total)
    .sort(([, left], [, right]) => right.total - left.total)[0]?.[0] ?? null;
}

function looksLikeQuestion(text: string) {
  return /[?:]\s*$/.test(text) || /^\d+[\).]\s+/.test(text);
}

function parseDocumentParagraphs(xml: string) {
  const paragraphs: DocxParagraph[] = [];

  for (const paragraphXml of xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? []) {
    const styleMatch = paragraphXml.match(/<w:pStyle\b[^>]*\bw:val="([^"]+)"/);
    const styleId = styleMatch?.[1] ?? null;
    const runs = paragraphXml.match(/<w:r\b[\s\S]*?<\/w:r>/g) ?? [];
    const pieces: string[] = [];
    let hasBoldText = false;

    for (const runXml of runs) {
      const runText = extractRunText(runXml);
      if (!runText) continue;
      pieces.push(runText);
      if (isBoldRun(runXml) && runText.trim()) hasBoldText = true;
    }

    const text = normalizeText(pieces.join(""));
    if (!text) continue;

    paragraphs.push({ text, styleId, hasBoldText });
  }

  return paragraphs;
}

function extractRunText(runXml: string) {
  const pieces: string[] = [];
  const tokenRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(runXml))) {
    if (match[1] !== undefined) {
      pieces.push(decodeXmlEntities(match[1]));
    } else if (match[0].startsWith("<w:tab")) {
      pieces.push(" ");
    } else {
      pieces.push("\n");
    }
  }

  return pieces.join("");
}

function isBoldRun(runXml: string) {
  const runProperties = runXml.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
  if (!runProperties) return false;

  const boldTags = runProperties.match(/<w:b(?:\b[^>]*)?\/>|<w:bCs(?:\b[^>]*)?\/>/g) ?? [];
  return boldTags.some((tag) => !/\bw:val="(?:0|false)"/i.test(tag));
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function readDocxEntry(buffer: Buffer, entryName: string) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  let offset = centralDirectoryOffset;

  while (offset < centralDirectoryEnd) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Некорректная структура DOCX: центральный каталог не найден");
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    if (fileName === entryName) {
      return readLocalFile(buffer, localHeaderOffset, compressedSize, compressionMethod).toString("utf8");
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error("В DOCX не найден word/document.xml");
}

function readLocalFile(buffer: Buffer, offset: number, compressedSize: number, compressionMethod: number) {
  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error("Некорректная структура DOCX: локальный заголовок не найден");
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);

  if (compressionMethod === 0) return compressed;
  if (compressionMethod === 8) return inflateRawSync(compressed);

  throw new Error(`DOCX использует неподдерживаемый метод сжатия: ${compressionMethod}`);
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 65557);

  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset;
  }

  throw new Error("Файл не похож на DOCX: не найден конец ZIP-архива");
}
