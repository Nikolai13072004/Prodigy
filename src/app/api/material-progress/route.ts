import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  LearningApplicationError,
} from "@/modules/learning/application/record-material-learning-event";
import { isMaterialLearningEvent } from "@/modules/learning/domain/material-learning";
import { recordMaterialLearningEvent } from "@/modules/learning/server/record-material-learning-event";

type Payload = {
  courseItemId?: unknown;
  event?: unknown;
};

const ERROR_STATUSES = {
  MATERIAL_NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_EVENT: 400,
} as const;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Payload | null;
  if (typeof body?.courseItemId !== "string" || !isMaterialLearningEvent(body.event)) {
    return NextResponse.json({ error: "Некорректное событие обучения" }, { status: 400 });
  }

  try {
    const state = await recordMaterialLearningEvent({
      actor: {
        id: session.user.id,
        roles: session.user.roles,
        permissions: session.user.permissions ?? [],
      },
      materialId: body.courseItemId,
      event: body.event,
    });
    return NextResponse.json({ ok: true, ...state });
  } catch (error) {
    if (error instanceof LearningApplicationError) {
      return NextResponse.json(
        { error: error.message },
        { status: ERROR_STATUSES[error.code] },
      );
    }
    throw error;
  }
}
