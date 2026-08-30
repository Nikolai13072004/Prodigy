"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import prisma from "@/lib/prisma";
import { mergeCourseAccessExpiry } from "@/lib/course-access-window";
import { hashCourseInviteToken } from "@/lib/course-invites";
import { getPlatformSecuritySettings, validatePasswordAgainstPolicy } from "@/lib/platform-settings";
import { ensureSystemRoleProfiles } from "@/lib/role-profiles";
import { STANDARD_ROLE_NAMES } from "@/lib/roles";
import { USER_STATUSES } from "@/lib/users";
import {
  resolveExistingUserInviteAcceptance,
  resolveInviteState,
} from "@/modules/enrollment/domain/course-invite-acceptance";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function invitePageUrl(token: string, params?: Record<string, string | undefined>) {
  const base = `/invite/${token}`;
  if (!params) return base;

  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });

  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

function courseUrl(courseId: string) {
  return `/courses/${courseId}`;
}

async function loadInvite(token: string) {
  return prisma.courseInvite.findUnique({
    where: { tokenHash: hashCourseInviteToken(token) },
    include: {
      course: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });
}

function inviteError(token: string, message: string): never {
  redirect(invitePageUrl(token, { error: message }));
}

export async function acceptCourseInvite(formData: FormData) {
  await ensureSystemRoleProfiles();
  const securitySettings = await getPlatformSecuritySettings();

  const token = asString(formData, "token");
  const name = asString(formData, "name");
  const login = asString(formData, "login").toLowerCase();
  const password = asString(formData, "password");

  if (!token) redirect("/login");
  if (!name) inviteError(token, "Укажите имя и фамилию.");
  if (!login) inviteError(token, "Укажите логин.");
  if (!password) inviteError(token, "Укажите пароль.");
  const passwordError = validatePasswordAgainstPolicy(password, securitySettings);
  if (passwordError) inviteError(token, passwordError);

  const invite = await loadInvite(token);
  if (!invite) inviteError(token, "Приглашение не найдено или уже недействительно.");
  const inviteState = resolveInviteState(invite, new Date());
  if (inviteState.kind === "rejected") {
    inviteError(token, inviteState.message);
  }
  if (inviteState.kind === "expired") {
    await prisma.courseInvite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" },
    }).catch(() => undefined);
    inviteError(token, inviteState.message);
  }

  const studentRoleProfile = await prisma.roleProfile.findUnique({
    where: { name: STANDARD_ROLE_NAMES.STUDENT },
    select: { id: true },
  });
  if (!studentRoleProfile) {
    throw new Error("Не удалось найти системную роль 'Ученик'");
  }

  const existingUserByEmail = await prisma.user.findFirst({
    where: { email: invite.email },
    include: {
      userRoles: {
        include: {
          roleProfile: {
            select: { name: true },
          },
        },
      },
    },
  });

  if (existingUserByEmail) {
    const acceptance = resolveExistingUserInviteAcceptance({
      user: existingUserByEmail,
      submittedLogin: login,
    });
    if (acceptance.kind === "error") {
      inviteError(token, acceptance.message);
    }

    await prisma.$transaction(async (tx) => {
      const currentAssignment = await tx.courseUserAssignment.findUnique({
        where: {
          courseId_userId: {
            courseId: invite.courseId,
            userId: existingUserByEmail.id,
          },
        },
        select: { expiresAt: true },
      });

      await tx.courseUserAssignment.upsert({
        where: {
          courseId_userId: {
            courseId: invite.courseId,
            userId: existingUserByEmail.id,
          },
        },
        create: {
          courseId: invite.courseId,
          userId: existingUserByEmail.id,
          expiresAt: invite.accessExpiresAt,
        },
        update: {
          expiresAt: mergeCourseAccessExpiry(currentAssignment?.expiresAt, invite.accessExpiresAt),
        },
      });

      await tx.courseInvite.update({
        where: { id: invite.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedUserId: existingUserByEmail.id,
        },
      });
    });

    revalidatePath("/");
    revalidatePath("/courses");
    revalidatePath("/analytics");
    revalidatePath(`/courses/${invite.courseId}`);
    revalidatePath(`/courses/${invite.courseId}/learners`);
    revalidatePath(`/courses/${invite.courseId}/results`);
    revalidatePath(`/courses/${invite.courseId}/manage`);
    await signIn("credentials", {
      login,
      password,
      redirectTo: courseUrl(invite.courseId),
    });
  }

  const existingUserByLogin = await prisma.user.findUnique({
    where: { login },
    select: { id: true },
  });
  if (existingUserByLogin) {
    inviteError(token, "Пользователь с таким логином уже существует. Укажите другой логин.");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name,
          login,
          email: invite.email,
          passwordHash,
          role: STANDARD_ROLE_NAMES.STUDENT,
          status: USER_STATUSES.ACTIVE,
          userRoles: {
            create: {
              roleProfileId: studentRoleProfile.id,
            },
          },
        },
      });

      await tx.courseUserAssignment.upsert({
        where: {
          courseId_userId: {
            courseId: invite.courseId,
            userId: createdUser.id,
          },
        },
        create: {
          courseId: invite.courseId,
          userId: createdUser.id,
          expiresAt: invite.accessExpiresAt,
        },
        update: {
          expiresAt: mergeCourseAccessExpiry(undefined, invite.accessExpiresAt),
        },
      });

      await tx.courseInvite.update({
        where: { id: invite.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedUserId: createdUser.id,
        },
      });
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "P2002") {
      inviteError(token, "Не удалось завершить регистрацию: логин или email уже заняты.");
    }
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/courses");
  revalidatePath("/analytics");
  revalidatePath(`/courses/${invite.courseId}`);
  revalidatePath(`/courses/${invite.courseId}/learners`);
  revalidatePath(`/courses/${invite.courseId}/results`);
  revalidatePath(`/courses/${invite.courseId}/manage`);
  revalidatePath("/admin/users-groups");
  await signIn("credentials", {
    login,
    password,
    redirectTo: courseUrl(invite.courseId),
  });
}
