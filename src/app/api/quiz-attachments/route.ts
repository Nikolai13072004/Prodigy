import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { canOpenQuizPage } from "@/lib/access";
import prisma from "@/lib/prisma";
import { putBufferDedup } from "@/lib/storage/dedup";

export const runtime = "nodejs";

type FileQuestionConfig = {
  allowedExtensions?: string[];
  maxFileSizeMb?: number;
};

function parseConfig<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeAllowedExtensions(extensions: string[] | undefined) {
  return [...new Set((extensions ?? [])
    .map((value) => value.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean))];
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function getSafeOriginalName(file: Blob) {
  const name = typeof (file as File).name === "string" ? (file as File).name : "file";
  return name.split(/[/\\]/).pop()?.trim() || "file";
}

function extractExtension(value: string) {
  const normalized = value.split("?")[0] ?? value;
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex + 1).toLowerCase() : "";
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return jsonError("Требуется вход", 401);
    }

    const formData = await request.formData();
    const courseId = String(formData.get("courseId") ?? "").trim();
    const quizId = String(formData.get("quizId") ?? "").trim();
    const questionId = String(formData.get("questionId") ?? "").trim();
    const file = formData.get("file");

    if (!courseId || !quizId || !questionId) {
      return jsonError("Недостаточно данных для загрузки ответа", 400);
    }
    if (!file || !(file instanceof Blob)) {
      return jsonError("Файл не передан", 400);
    }
    if (file.size < 1) {
      return jsonError("Пустой файл загрузить нельзя", 400);
    }

    const question = await prisma.question.findFirst({
      where: {
        id: questionId,
        quizId,
      },
      select: {
        id: true,
        type: true,
        config: true,
        quiz: {
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
        },
      },
    });

    if (!question || question.quiz.courseItem.courseId !== courseId) {
      return jsonError("Вопрос не найден", 404);
    }

    const allowed = await canOpenQuizPage(
      session.user.id,
      session.user.roles,
      question.quiz,
      session.user.permissions
    );
    if (!allowed) {
      return jsonError("Нет доступа к тесту", 403);
    }

    if (question.type !== "FILE") {
      return jsonError("Для этого вопроса загрузка файла не поддерживается", 400);
    }

    const config = parseConfig<FileQuestionConfig>(question.config, {
      allowedExtensions: [],
      maxFileSizeMb: 10,
    });
    const allowedExtensions = normalizeAllowedExtensions(config.allowedExtensions);
    const maxFileSizeMb =
      typeof config.maxFileSizeMb === "number" && Number.isFinite(config.maxFileSizeMb)
        ? Math.min(Math.max(config.maxFileSizeMb, 1), 200)
        : 10;

    if (file.size > maxFileSizeMb * 1024 * 1024) {
      return jsonError(`Файл слишком большой (макс. ${maxFileSizeMb} МБ)`, 413);
    }

    const originalName = getSafeOriginalName(file);
    const extension = extractExtension(originalName);
    if (!extension || (allowedExtensions.length > 0 && !allowedExtensions.includes(extension))) {
      return jsonError(
        `Разрешены только файлы: ${allowedExtensions.map((value) => value.toUpperCase()).join(", ")}`,
        415
      );
    }

    const storageName = `${randomUUID()}.${extension}`;
    const attachment = await putBufferDedup(
      "uploads",
      `quiz-attachments/${storageName}`,
      Buffer.from(await file.arrayBuffer()),
      {
        extension,
        mimeType: file.type,
        originalName,
        purpose: "quiz_attachment",
      }
    );

    return NextResponse.json({
      url: attachment.object.url,
      fileName: originalName,
      size: file.size,
      deduplicated: attachment.deduplicated,
    });
  } catch (error) {
    console.error("Quiz attachment upload failed:", error);
    return jsonError("Не удалось загрузить файл. Попробуйте еще раз.", 500);
  }
}
