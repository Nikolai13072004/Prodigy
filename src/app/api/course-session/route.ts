import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { canViewCourseContent } from "@/lib/access";
import prisma from "@/lib/prisma";

type Payload = {
  courseId?: string;
  courseItemId?: string;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Payload | null;
  if (!body?.courseId || !body.courseItemId) {
    return NextResponse.json({ error: "Не передан курс или урок" }, { status: 400 });
  }

  const item = await prisma.courseItem.findFirst({
    where: {
      id: body.courseItemId,
      courseId: body.courseId,
    },
    select: {
      id: true,
      courseId: true,
    },
  });

  if (!item) {
    return NextResponse.json({ error: "Урок не найден" }, { status: 404 });
  }

  const allowed = await canViewCourseContent(
    session.user.id,
    session.user.roles,
    item.courseId,
    session.user.permissions
  );
  if (!allowed) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  await prisma.courseLearnerState.upsert({
    where: {
      courseId_userId: {
        courseId: item.courseId,
        userId: session.user.id,
      },
    },
    create: {
      courseId: item.courseId,
      userId: session.user.id,
      lastOpenedCourseItemId: item.id,
    },
    update: {
      lastOpenedCourseItemId: item.id,
    },
  });

  return NextResponse.json({ ok: true });
}
