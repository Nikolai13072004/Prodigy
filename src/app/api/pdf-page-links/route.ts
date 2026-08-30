import { execFile } from "child_process";
import { stat } from "fs/promises";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const MAX_RENDERED_PAGE = 1000;

type PdfPageLink = {
  href: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type PdfPageLinksPayload = {
  page: {
    width: number;
    height: number;
  };
  links: PdfPageLink[];
};

function resolveLocalPdf(urlValue: string) {
  if (!urlValue.startsWith("/uploads/") || !/\.pdf(\?|#|$)/i.test(urlValue)) return null;
  return storage.resolveUrl(urlValue, "uploads")?.absolutePath ?? null;
}

function parsePage(value: string | null) {
  const page = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(page) || page < 1 || page > MAX_RENDERED_PAGE) return null;
  return page;
}

function getXmlAttribute(source: string, name: string) {
  const match = source.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match?.[1] ?? null;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseNumberAttribute(source: string, name: string) {
  const value = getXmlAttribute(source, name);
  if (!value) return null;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function parsePdfLinksXml(xml: string): PdfPageLinksPayload {
  const pageMatch = xml.match(/<page\b([^>]*)>/i);
  const pageAttrs = pageMatch?.[1] ?? "";
  const pageWidth = parseNumberAttribute(pageAttrs, "width") ?? 1;
  const pageHeight = parseNumberAttribute(pageAttrs, "height") ?? 1;
  const links: PdfPageLink[] = [];
  const textPattern = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;

  for (const match of xml.matchAll(textPattern)) {
    const attrs = match[1];
    const body = match[2];
    const linkMatch = body.match(/<a\b([^>]*)>/i);
    if (!linkMatch) continue;

    const href = getXmlAttribute(linkMatch[1], "href");
    const left = parseNumberAttribute(attrs, "left");
    const top = parseNumberAttribute(attrs, "top");
    const width = parseNumberAttribute(attrs, "width");
    const height = parseNumberAttribute(attrs, "height");
    if (!href || left === null || top === null || width === null || height === null) continue;

    links.push({
      href: decodeXmlEntities(href),
      text: decodeXmlEntities(body.replace(/<[^>]*>/g, "")).trim(),
      left: (left / pageWidth) * 100,
      top: (top / pageHeight) * 100,
      width: (width / pageWidth) * 100,
      height: (height / pageHeight) * 100,
    });
  }

  return {
    page: {
      width: pageWidth,
      height: pageHeight,
    },
    links,
  };
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const urlValue = request.nextUrl.searchParams.get("url");
  const page = parsePage(request.nextUrl.searchParams.get("page"));
  if (!urlValue || !page) {
    return NextResponse.json({ error: "Не указан PDF или номер страницы" }, { status: 400 });
  }

  const pdfPath = resolveLocalPdf(urlValue);
  if (!pdfPath) {
    return NextResponse.json({ error: "Поддерживаются только локальные PDF из uploads" }, { status: 400 });
  }

  try {
    const info = await stat(pdfPath);
    if (!info.isFile()) {
      return NextResponse.json({ error: "PDF не найден" }, { status: 404 });
    }

    const { stdout } = await execFileAsync("pdftohtml", [
      "-f",
      String(page),
      "-l",
      String(page),
      "-xml",
      "-stdout",
      pdfPath,
    ], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });

    return NextResponse.json(parsePdfLinksXml(stdout), {
      headers: { "Cache-Control": "private, max-age=86400" },
    });
  } catch (error) {
    console.error("PDF page links extraction failed:", error);
    return NextResponse.json({ error: "Не удалось прочитать ссылки страницы" }, { status: 500 });
  }
}
