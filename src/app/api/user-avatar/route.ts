import { randomUUID } from "crypto";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { PERMISSIONS, STANDARD_ROLE_NAMES, hasPermission } from "@/lib/roles";
import { putBufferDedup } from "@/lib/storage/dedup";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function roleNamesForUser(user: {
  role: string;
  userRoles: Array<{ roleProfile: { name: string } }>;
}) {
  return [
    ...new Set(
      [
        ...user.userRoles.map((item) => item.roleProfile.name),
        user.role,
      ].filter(Boolean),
    ),
  ];
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return jsonError("Требуется вход", 401);
    }
    if (
      !hasPermission(
        session.user.roles,
        PERMISSIONS.USERS_EDIT_PROFILE,
        session.user.permissions,
      )
    ) {
      return jsonError("Недостаточно прав", 403);
    }

    const formData = await request.formData();
    const userId = String(formData.get("userId") ?? "").trim();
    const file = formData.get("file");

    if (!userId) {
      return jsonError("Пользователь не указан", 400);
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        userRoles: {
          include: {
            roleProfile: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!targetUser) {
      return jsonError("Пользователь не найден", 404);
    }

    const canEditAccessLevel = hasPermission(
      session.user.roles,
      PERMISSIONS.USERS_EDIT_ACCESS_LEVEL,
      session.user.permissions,
    );
    if (
      !canEditAccessLevel &&
      !roleNamesForUser(targetUser).includes(STANDARD_ROLE_NAMES.STUDENT)
    ) {
      return jsonError("HR может менять аватар только у учеников", 403);
    }

    if (!file || !(file instanceof Blob)) {
      return jsonError("Файл не передан", 400);
    }
    if (file.size < 1) {
      return jsonError("Пустой файл загрузить нельзя", 400);
    }
    if (file.size > MAX_BYTES) {
      return jsonError("Размер файла не должен превышать 5 МБ", 413);
    }

    const originalName =
      typeof (file as File).name === "string" ? (file as File).name : "avatar";
    const extFromName = path.extname(originalName).toLowerCase();
    const ext =
      extFromName || EXT_BY_MIME[file.type.trim().toLowerCase()] || "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return jsonError("Поддерживаются только PNG, JPG, WebP и GIF", 415);
    }

    const sourceBuffer = Buffer.from(await file.arrayBuffer());
    let outputBuffer: Buffer;
    try {
      outputBuffer = await sharp(sourceBuffer)
        .rotate()
        .resize(256, 256, {
          fit: "cover",
          position: "centre",
        })
        .webp({ quality: 88 })
        .toBuffer();
    } catch (error) {
      return jsonError(
        error instanceof Error
          ? "Не удалось обработать изображение"
          : "Не удалось прочитать файл изображения",
        422,
      );
    }

    const fileName = `${randomUUID()}.webp`;
    const avatar = await putBufferDedup("uploads", `user-avatars/${fileName}`, outputBuffer, {
      extension: ".webp",
      mimeType: "image/webp",
      originalName,
      purpose: "user_avatar",
    });

    return NextResponse.json({ url: avatar.object.url, deduplicated: avatar.deduplicated });
  } catch (error) {
    console.error("User avatar upload failed", error);
    return jsonError("Не удалось загрузить аватар", 500);
  }
}
