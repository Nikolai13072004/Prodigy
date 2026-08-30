import { randomUUID } from "crypto";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageCourse } from "@/lib/access";
import prisma from "@/lib/prisma";
import {
  getQuizQuestionMediaKind,
  QUIZ_QUESTION_MEDIA_EXTENSION_BY_MIME,
  QUIZ_QUESTION_MEDIA_EXTENSIONS,
  QUIZ_QUESTION_MEDIA_MIME_TYPES,
} from "@/lib/quiz-question-media";
import { PERMISSIONS, hasPermission } from "@/lib/roles";
import { putStreamDedup } from "@/lib/storage/dedup";

export const runtime = "nodejs";

const MAX_BYTES = 200 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function getSafeOriginalName(file: Blob) {
  const rawName = typeof (file as File).name === "string" ? (file as File).name : "file";
  const baseName = rawName.split(/[/\\]/).pop()?.trim() || "file";
  return baseName.replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, "").slice(0, 140) || "file";
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return jsonError("Требуется вход", 401);
    }
    if (!hasPermission(session.user.roles, PERMISSIONS.COURSES_CREATE_EDIT, session.user.permissions)) {
      return jsonError("Недостаточно прав", 403);
    }

    const formData = await request.formData();
    const courseId = String(formData.get("courseId") ?? "").trim();
    const quizId = String(formData.get("quizId") ?? "").trim();
    const file = formData.get("file");

    if (!courseId || !quizId) {
      return jsonError("Недостаточно данных для загрузки медиа", 400);
    }

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        courseItem: {
          select: {
            courseId: true,
            course: {
              select: {
                ownerId: true,
              },
            },
          },
        },
      },
    });

    if (!quiz || quiz.courseItem.courseId !== courseId) {
      return jsonError("Тест не найден", 404);
    }
    if (!canManageCourse(session.user.roles, session.user.id, quiz.courseItem.course)) {
      return jsonError("Нет доступа к тесту", 403);
    }

    if (!file || !(file instanceof Blob)) {
      return jsonError("Файл не передан", 400);
    }
    if (file.size < 1) {
      return jsonError("Пустой файл загрузить нельзя", 400);
    }
    if (file.size > MAX_BYTES) {
      return jsonError("Файл слишком большой (макс. 200 МБ)", 413);
    }

    const originalName = getSafeOriginalName(file);
    const extFromName = path.extname(originalName).toLowerCase();
    const mimeTypeFromFile = file.type.trim().toLowerCase();
    const ext = extFromName || QUIZ_QUESTION_MEDIA_EXTENSION_BY_MIME[mimeTypeFromFile] || "";
    const mimeType = mimeTypeFromFile || MIME_BY_EXTENSION[ext] || "";

    if (!QUIZ_QUESTION_MEDIA_EXTENSIONS.has(ext) || !QUIZ_QUESTION_MEDIA_MIME_TYPES.has(mimeType)) {
      return jsonError("Поддерживаются PNG, JPG, WebP, GIF, MP4 и WebM", 415);
    }

    const kind = getQuizQuestionMediaKind(mimeType);
    if (!kind) {
      return jsonError("Неподдерживаемый тип медиа", 415);
    }

    const storageName = `${randomUUID()}${ext}`;
    const mediaFile = await putStreamDedup(
      "uploads",
      `quiz-question-media/${storageName}`,
      Readable.fromWeb(file.stream() as unknown as import("stream/web").ReadableStream),
      {
        extension: ext,
        mimeType,
        originalName,
        purpose: "quiz_question_media",
      }
    );

    return NextResponse.json({
      media: {
        kind,
        url: mediaFile.object.url,
        fileName: originalName,
        mimeType,
        size: file.size,
        deduplicated: mediaFile.deduplicated,
      },
    });
  } catch (error) {
    console.error("Quiz question media upload failed:", error);
    return jsonError("Не удалось загрузить медиа. Попробуйте еще раз.", 500);
  }
}
