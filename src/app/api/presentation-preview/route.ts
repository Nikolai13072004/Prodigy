import { execFile } from "child_process";
import { access, rm, stat } from "fs/promises";
import path from "path";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPptxRenderEnv } from "@/lib/pptx-render-env";
import { PERMISSIONS, hasPermission } from "@/lib/roles";
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

async function getPdfPageCount(filePath: string) {
  const { stdout } = await execFileAsync("pdfinfo", [filePath], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  return parsePagesCount(stdout);
}

function resolveLocalUploadPath(fileUrl: string) {
  if (!fileUrl.startsWith("/uploads/")) return null;
  return storage.resolveUrl(fileUrl, "uploads")?.absolutePath ?? null;
}

async function convertPptxToPdf(filePath: string) {
  const outputDir = path.dirname(filePath);
  const outputBaseName = path.basename(filePath, path.extname(filePath));
  const outputPath = path.join(outputDir, `${outputBaseName}.pdf`);
  const profileDir = path.join("/tmp", `lo-preview-${outputBaseName}`);

  try {
    await execFileAsync(
      "soffice",
      [
        "--headless",
        "--nologo",
        "--nodefault",
        "--norestore",
        `-env:UserInstallation=file://${profileDir}`,
        "--convert-to",
        "pdf:impress_pdf_Export",
        "--outdir",
        outputDir,
        filePath,
      ],
      {
        timeout: 180_000,
        maxBuffer: 10 * 1024 * 1024,
        env: getPptxRenderEnv(),
      }
    );
  } finally {
    await rm(profileDir, { recursive: true, force: true });
  }

  await access(outputPath);
  return outputPath;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    }
    if (!hasPermission(session.user.roles, PERMISSIONS.COURSES_CREATE_EDIT, session.user.permissions)) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const payload = (await req.json()) as { url?: unknown };
    const sourceUrl = typeof payload.url === "string" ? payload.url : "";
    const sourcePath = resolveLocalUploadPath(sourceUrl);
    if (!sourcePath) {
      return NextResponse.json({ error: "Поддерживаются только локальные файлы из uploads" }, { status: 400 });
    }

    const sourceInfo = await stat(sourcePath).catch(() => null);
    if (!sourceInfo?.isFile()) {
      return NextResponse.json({ error: "Файл презентации не найден. Перезагрузите презентацию." }, { status: 404 });
    }

    const cleanUrl = sourceUrl.split(/[?#]/, 1)[0] ?? "";
    let previewPath: string;
    let previewUrl: string;

    if (/\.pdf$/i.test(cleanUrl)) {
      previewPath = sourcePath;
      previewUrl = cleanUrl;
    } else if (/\.pptx$/i.test(cleanUrl)) {
      previewPath = sourcePath.replace(/\.pptx$/i, ".pdf");
      const previewInfo = await stat(previewPath).catch(() => null);
      if (!previewInfo?.isFile()) {
        previewPath = await convertPptxToPdf(sourcePath);
      }
      previewUrl = cleanUrl.replace(/\.pptx$/i, ".pdf");
    } else {
      return NextResponse.json({ error: "Поддерживаются только PDF и PPTX" }, { status: 415 });
    }

    const pages = await getPdfPageCount(previewPath);
    if (!pages) {
      return NextResponse.json({ error: "Не удалось определить количество страниц PDF" }, { status: 500 });
    }

    return NextResponse.json({ previewUrl, pages });
  } catch (error) {
    console.error("Presentation preview API error:", error);
    return NextResponse.json({ error: "Не удалось подготовить презентацию для предпросмотра." }, { status: 500 });
  }
}
