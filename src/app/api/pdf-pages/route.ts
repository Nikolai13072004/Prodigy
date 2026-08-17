import { execFile } from "child_process";
import { access } from "fs/promises";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

function parsePagesCount(stdout: string) {
  const match = stdout.match(/Pages:\s+(\d+)/i);
  if (!match) return null;
  const pages = Number.parseInt(match[1], 10);
  if (!Number.isFinite(pages) || pages < 1) return null;
  return pages;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const urlValue = req.nextUrl.searchParams.get("url");
  if (!urlValue) {
    return NextResponse.json({ error: "Не указан url" }, { status: 400 });
  }

  // For security, only allow local uploaded files.
  if (!urlValue.startsWith("/uploads/")) {
    return NextResponse.json({ error: "Поддерживаются только локальные файлы uploads" }, { status: 400 });
  }
  if (!/\.pdf(\?|#|$)/i.test(urlValue)) {
    return NextResponse.json({ error: "Ожидается PDF файл" }, { status: 400 });
  }

  const target = storage.resolveUrl(urlValue, "uploads");
  if (!target) {
    return NextResponse.json({ error: "Поддерживаются только локальные файлы uploads" }, { status: 400 });
  }

  try {
    await access(target.absolutePath);
    const { stdout } = await execFileAsync("pdfinfo", [target.absolutePath], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    const pages = parsePagesCount(stdout);
    if (!pages) {
      return NextResponse.json({ error: "Не удалось определить количество страниц PDF" }, { status: 422 });
    }
    return NextResponse.json({ pages });
  } catch (error) {
    console.error("pdf-pages route error:", error);
    return NextResponse.json({ error: "Не удалось прочитать PDF" }, { status: 500 });
  }
}
