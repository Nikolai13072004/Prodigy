import { randomUUID } from "crypto";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@/auth";
import { PERMISSIONS, hasPermission } from "@/lib/roles";
import { putBufferDedup } from "@/lib/storage/dedup";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif"]);
const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
};

type CourseAssetKind = "thumbnail" | "cover";

const TARGET_SIZE_BY_KIND: Record<CourseAssetKind, { width: number; height: number }> = {
  thumbnail: { width: 640, height: 360 },
  cover: { width: 1920, height: 500 },
};

function normalizeExtension(ext: string) {
  return ext === ".jpeg" ? ".jpg" : ext;
}

function sharpInputOptions(ext: string) {
  return ext === ".gif" ? { animated: true } : undefined;
}

async function assertImageCanBeRead(buffer: Buffer, ext: string) {
  const metadata = await sharp(buffer, sharpInputOptions(ext)).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Не удалось определить размер изображения");
  }
}

async function resizeCourseAsset(buffer: Buffer, kind: CourseAssetKind, ext: string) {
  const target = TARGET_SIZE_BY_KIND[kind];
  const normalizedExt = normalizeExtension(ext);
  const pipeline = sharp(buffer, sharpInputOptions(ext))
    .rotate()
    .resize(target.width, target.height, {
      fit: "cover",
      position: "centre",
    });

  if (normalizedExt === ".jpg") {
    return {
      buffer: await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer(),
      ext: normalizedExt,
    };
  }

  if (normalizedExt === ".gif") {
    return {
      buffer: await pipeline.gif().toBuffer(),
      ext: normalizedExt,
    };
  }

  return {
    buffer: await pipeline.png({ compressionLevel: 9 }).toBuffer(),
    ext: ".png",
  };
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

    const formData = await request.formData();
    const file = formData.get("file");
    const kindValue = String(formData.get("kind") ?? "");
    const kind: CourseAssetKind | null =
      kindValue === "thumbnail" || kindValue === "cover" ? kindValue : null;
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Размер файла не должен превышать 5 МБ" }, { status: 413 });
    }

    const originalName = typeof (file as File).name === "string" ? (file as File).name : "cover";
    const extFromName = (path.extname(originalName) || "").toLowerCase();
    const ext = extFromName || EXT_BY_MIME[file.type] || "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: "Поддерживаются только JPEG, PNG и GIF" }, { status: 415 });
    }

    const sourceBuffer = Buffer.from(await file.arrayBuffer());
    let outputBuffer: Buffer<ArrayBufferLike> = sourceBuffer;
    let outputExt = normalizeExtension(ext);

    try {
      if (kind) {
        const processed = await resizeCourseAsset(sourceBuffer, kind, outputExt);
        outputBuffer = processed.buffer;
        outputExt = processed.ext;
      } else {
        await assertImageCanBeRead(sourceBuffer, outputExt);
      }
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Не удалось обработать изображение" },
        { status: 422 }
      );
    }

    const fileName = `${randomUUID()}${outputExt}`;
    const asset = await putBufferDedup("uploads", `course-covers/${fileName}`, outputBuffer, {
      extension: outputExt,
      mimeType: file.type,
      originalName,
      purpose: kind ? `course_${kind}` : "course_asset",
    });

    return NextResponse.json({ url: asset.object.url, deduplicated: asset.deduplicated });
  } catch (error) {
    console.error("Course cover upload failed", error);
    return NextResponse.json({ error: "Не удалось загрузить обложку курса" }, { status: 500 });
  }
}
