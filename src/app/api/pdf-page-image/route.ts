import { execFile } from "child_process";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const MAX_RENDERED_PAGE = 1000;

function resolveLocalPdf(urlValue: string) {
  if (!urlValue.startsWith("/uploads/") || !/\.pdf(\?|#|$)/i.test(urlValue)) return null;
  return storage.resolveUrl(urlValue, "uploads")?.absolutePath ?? null;
}

function parsePage(value: string | null) {
  const page = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(page) || page < 1 || page > MAX_RENDERED_PAGE) return null;
  return page;
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

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pdf-page-"));
  const outputPrefix = path.join(tempDir, "slide");
  const outputPath = `${outputPrefix}.png`;

  try {
    const info = await stat(pdfPath);
    if (!info.isFile()) {
      return NextResponse.json({ error: "PDF не найден" }, { status: 404 });
    }

    await execFileAsync(
      "pdftoppm",
      [
        "-png",
        "-f",
        String(page),
        "-l",
        String(page),
        "-singlefile",
        "-scale-to",
        "1800",
        pdfPath,
        outputPrefix,
      ],
      {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      }
    );

    const image = await readFile(outputPath);
    return new NextResponse(image, {
      headers: {
        "Cache-Control": "private, max-age=86400",
        "Content-Length": String(image.byteLength),
        "Content-Type": "image/png",
      },
    });
  } catch (error) {
    console.error("PDF page image render failed:", error);
    return NextResponse.json({ error: "Не удалось подготовить изображение страницы" }, { status: 500 });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
