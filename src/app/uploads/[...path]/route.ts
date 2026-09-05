import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { storage } from "@/lib/storage";
import { canAccessUpload } from "@/lib/storage/upload-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
};

function contentTypeFor(filePath: string) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function isSafeSegment(segment: string) {
  return Boolean(segment) && segment !== "." && segment !== ".." && !segment.includes("/") && !segment.includes("\\");
}

async function resolveUploadPath(context: RouteContext) {
  const params = await context.params;
  const segments = params.path ?? [];
  if (segments.length === 0 || !segments.every(isSafeSegment)) return null;

  const key = segments.join("/");
  return { key, absolutePath: storage.path("uploads", key) };
}

function cacheControlFor(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html" || extension === ".htm") {
    return "private, max-age=0, must-revalidate";
  }

  return "private, max-age=31536000, immutable";
}

// Типы, которые браузер исполняет как документ в origin приложения. Без изоляции
// загруженный автором курса пакет получает доступ к сессии пользователя: PPTX
// конвертируется в HTML5 именно сюда, а `<img>`-рендер SVG от скриптов не спасает,
// если файл открыть по прямой ссылке.
const EXECUTABLE_EXTENSIONS = new Set([".html", ".htm", ".svg"]);

function isExecutableDocument(filePath: string) {
  return EXECUTABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function commonHeaders(filePath: string, size: number) {
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControlFor(filePath),
    "Content-Disposition": `inline; filename="${path.basename(filePath).replace(/"/g, "")}"`,
    "Content-Length": String(size),
    "Content-Type": contentTypeFor(filePath),
    // Тип берётся из расширения, а не угадывается по содержимому.
    "X-Content-Type-Options": "nosniff",
  });

  if (isExecutableDocument(filePath)) {
    // Без `allow-same-origin` документ попадает в opaque origin: скрипты внутри
    // работают (HTML5-плеер это требует), но cookie, localStorage и DOM
    // приложения им недоступны. Эффективная песочница — пересечение с атрибутом
    // `sandbox` у iframe, поэтому заголовок закрывает и прямое открытие по ссылке.
    headers.set("Content-Security-Policy", "sandbox allow-scripts allow-popups");
  }

  return headers;
}

function parseRange(rangeHeader: string | null, size: number) {
  if (!rangeHeader) return null;
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return "invalid" as const;

  const startRaw = match[1];
  const endRaw = match[2];
  if (!startRaw && !endRaw) return "invalid" as const;

  let start: number;
  let end: number;

  if (!startRaw) {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return "invalid" as const;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number.parseInt(startRaw, 10);
    end = endRaw ? Number.parseInt(endRaw, 10) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return "invalid" as const;
  }

  return {
    start,
    end: Math.min(end, size - 1),
  };
}

async function serveUpload(request: NextRequest, context: RouteContext, includeBody: boolean) {
  const resolved = await resolveUploadPath(context);
  if (!resolved) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }

  // Хранилище вынесено из public/, поэтому этот роут — единственная выдача
  // байтов, и авторизация здесь не обходится статикой. Аутентификация, затем
  // проверка доступа к конкретному файлу по его владельцу.
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  if (!(await canAccessUpload(session.user, resolved.key))) {
    return NextResponse.json({ error: "Нет доступа к файлу" }, { status: 403 });
  }

  const filePath = resolved.absolutePath;

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
    }

    const range = parseRange(request.headers.get("range"), info.size);
    if (range === "invalid") {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${info.size}`,
        },
      });
    }

    if (range) {
      const headers = commonHeaders(filePath, range.end - range.start + 1);
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${info.size}`);
      const stream = includeBody ? createReadStream(filePath, range) : null;
      return new NextResponse(
        stream ? (Readable.toWeb(stream) as unknown as BodyInit) : null,
        {
          status: 206,
          headers,
        }
      );
    }

    const headers = commonHeaders(filePath, info.size);
    const stream = includeBody ? createReadStream(filePath) : null;
    return new NextResponse(stream ? (Readable.toWeb(stream) as unknown as BodyInit) : null, {
      headers,
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
    }
    console.error("Upload file route error:", error);
    return NextResponse.json({ error: "Не удалось открыть файл" }, { status: 500 });
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return serveUpload(request, context, true);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return serveUpload(request, context, false);
}
