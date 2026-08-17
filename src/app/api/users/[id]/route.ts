import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { auditActorFromSessionUser, recordAuditEvent, resolveAuditRequestContext } from "@/lib/audit-log";
import prisma from "@/lib/prisma";
import { PERMISSIONS, hasPermission } from "@/lib/roles";
import { buildUserDisplayName } from "@/lib/users";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  }

  if (!hasPermission(session.user.roles, PERMISSIONS.USERS_EDIT_PROFILE, session.user.permissions)) {
    return NextResponse.json({ error: "Недостаточно прав для редактирования пользователя." }, { status: 403 });
  }
  const { id } = await params;

  const body = (await request.json()) as {
    firstName?: string;
    lastName?: string | null;
    name?: string;
    login?: string;
    email?: string | null;
  };
  const legacyName = String(body?.name ?? "").trim();
  const firstName = String(body?.firstName ?? "").trim() || legacyName;
  const lastNameRaw = body?.lastName;
  const lastName = typeof lastNameRaw === "string" && lastNameRaw.trim() ? lastNameRaw.trim() : null;
  const name = buildUserDisplayName(firstName, lastName);
  const login = String(body?.login ?? "").trim().toLowerCase();
  const rawEmail = body?.email;
  const email = typeof rawEmail === "string" && rawEmail.trim() ? rawEmail.trim().toLowerCase() : null;

  if (!firstName) {
    return NextResponse.json({ error: "Имя обязательно." }, { status: 400 });
  }
  if (!login) {
    return NextResponse.json({ error: "Логин обязателен." }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        name,
        firstName,
        lastName,
        login,
        email,
      },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        login: true,
        email: true,
      },
    });
    const requestContext = resolveAuditRequestContext(request.headers);
    await recordAuditEvent({
      actor: auditActorFromSessionUser(session.user),
      action: "users:update",
      objectType: "user",
      objectId: user.id,
      objectLabel: user.name,
      ipAddress: requestContext.ipAddress,
      userAgent: requestContext.userAgent,
      metadata: {
        login: user.login,
        email: user.email,
        source: "api",
      },
    });
    revalidatePath("/admin/users-groups");
    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Логин или email уже используется." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Пользователь не найден." }, { status: 404 });
    }
    throw error;
  }
}
