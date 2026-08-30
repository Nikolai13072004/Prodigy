import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@/auth";
import { PERMISSIONS, hasPermission } from "@/lib/roles";
import { storage } from "@/lib/storage";
import { putBufferDedup } from "@/lib/storage/dedup";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const MAX_RENDERED_PAGE = 1000;
const COURSE_ASSET_TARGETS = {
  cover: { width: 1920, height: 500 },
  thumbnail: { width: 640, height: 360 },
};

function resolveLocalPdf(urlValue: string) {
  if (!urlValue.startsWith("/uploads/") || !/\.pdf(\?|#|$)/i.test(urlValue)) return null;
  return storage.resolveUrl(urlValue, "uploads")?.absolutePath ?? null;
}

function getUploadBaseName(urlValue: string) {
  const cleanPath = urlValue.split("?")[0].split("#")[0];
  if (!cleanPath.startsWith("/uploads/")) return null;

  const fileName = cleanPath.split("/").pop();
  if (!fileName) return null;

  const parsed = path.parse(fileName);
  return parsed.name || null;
}

async function resolveCleanHtml5Slide(sourceUrls: string[], page: number) {
  const pageNames = [`slide-${String(page).padStart(3, "0")}.jpg`, `slide-${String(page).padStart(3, "0")}.png`];
  for (const sourceUrl of sourceUrls) {
    const baseName = getUploadBaseName(sourceUrl);
    if (!baseName) continue;

    for (const pageName of pageNames) {
      const filePath = storage.path("uploads", `pptx-html5/${baseName}/base-slides/${pageName}`);

      const cleanSlideInfo = await stat(filePath).catch(() => null);
      if (cleanSlideInfo?.isFile()) return filePath;
    }
  }

  return null;
}

function parsePage(value: unknown) {
  const page = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(page) || page < 1 || page > MAX_RENDERED_PAGE) return null;
  return page;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    }

    if (!hasPermission(session.user.roles, PERMISSIONS.COURSES_CREATE_EDIT, session.user.permissions)) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const payload = (await request.json().catch(() => null)) as {
      url?: string;
      page?: number;
      clean?: boolean;
      sourcePresentationUrl?: string | null;
    } | null;
    const sourceUrl = payload?.url ?? "";
    const page = parsePage(payload?.page);

    if (!sourceUrl || !page) {
      return NextResponse.json({ error: "Укажите PDF и номер страницы" }, { status: 400 });
    }

    const pdfPath = resolveLocalPdf(sourceUrl);
    if (!pdfPath) {
      return NextResponse.json({ error: "Поддерживаются только локальные PDF из uploads" }, { status: 400 });
    }

    const info = await stat(pdfPath).catch(() => null);
    if (!info?.isFile()) {
      return NextResponse.json({ error: "PDF не найден" }, { status: 404 });
    }

    const coverFileName = `${randomUUID()}.png`;
    const thumbnailFileName = `${randomUUID()}.png`;
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "course-cover-page-"));
    const sourcePath = path.join(tempDir, "source.png");
    const outputPrefix = sourcePath.replace(/\.png$/i, "");

    try {
      const cleanSlidePath = payload?.clean
        ? await resolveCleanHtml5Slide([payload.sourcePresentationUrl ?? "", sourceUrl], page)
        : null;

      let renderedPage: Buffer;
      if (cleanSlidePath) {
        renderedPage = await readFile(cleanSlidePath);
      } else {
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

        renderedPage = await readFile(sourcePath);
      }
      const cover = await sharp(renderedPage)
        .resize(COURSE_ASSET_TARGETS.cover.width, COURSE_ASSET_TARGETS.cover.height, {
          fit: "cover",
          position: "centre",
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const thumbnail = await sharp(renderedPage)
        .resize(COURSE_ASSET_TARGETS.thumbnail.width, COURSE_ASSET_TARGETS.thumbnail.height, {
          fit: "cover",
          position: "centre",
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const [coverAsset, thumbnailAsset] = await Promise.all([
        putBufferDedup("uploads", `course-covers/${coverFileName}`, cover, {
          extension: ".png",
          mimeType: "image/png",
          purpose: "course_cover_from_pdf_page",
        }),
        putBufferDedup("uploads", `course-covers/${thumbnailFileName}`, thumbnail, {
          extension: ".png",
          mimeType: "image/png",
          purpose: "course_thumbnail_from_pdf_page",
        }),
      ]);

      return NextResponse.json({
        url: coverAsset.object.url,
        thumbnailUrl: thumbnailAsset.object.url,
        cleanUsed: Boolean(cleanSlidePath),
        deduplicated: coverAsset.deduplicated || thumbnailAsset.deduplicated,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error("Course cover generation from PDF failed", error);
    return NextResponse.json({ error: "Не удалось сформировать обложку из страницы презентации" }, { status: 500 });
  }
}
