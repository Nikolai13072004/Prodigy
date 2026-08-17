import { randomUUID } from "crypto";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isPlatformAdminRole } from "@/lib/roles";
import { putBufferDedup } from "@/lib/storage/dedup";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"]);
const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
};

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    }

    if (!isPlatformAdminRole(session.user.roles)) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Размер файла не должен превышать 5 МБ" }, { status: 413 });
    }

    const originalName = typeof (file as File).name === "string" ? (file as File).name : "asset";
    const extFromName = (path.extname(originalName) || "").toLowerCase();
    const ext = extFromName || EXT_BY_MIME[file.type] || "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: "Поддерживаются PNG, JPG, WEBP, SVG и ICO" }, { status: 415 });
    }

    const fileName = `${randomUUID()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await putBufferDedup("branding", fileName, buffer, {
      extension: ext,
      mimeType: file.type,
      originalName,
      purpose: "branding_asset",
    });

    return NextResponse.json({ url: asset.object.url, deduplicated: asset.deduplicated });
  } catch (error) {
    console.error("Brand asset upload failed", error);
    return NextResponse.json({ error: "Не удалось загрузить бренд-ассет" }, { status: 500 });
  }
}
