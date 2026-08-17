import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/storage";

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

  return storage.path("uploads", segments.join("/"));
}

function cacheControlFor(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html" || extension === ".htm") {
    return "private, max-age=0, must-revalidate";
  }

  return "private, max-age=31536000, immutable";
}

function commonHeaders(filePath: string, size: number) {
  return new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControlFor(filePath),
    "Content-Disposition": `inline; filename="${path.basename(filePath).replace(/"/g, "")}"`,
    "Content-Length": String(size),
    "Content-Type": contentTypeFor(filePath),
  });
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
  const filePath = await resolveUploadPath(context);
  if (!filePath) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }

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
