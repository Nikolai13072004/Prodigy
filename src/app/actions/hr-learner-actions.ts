"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth-guards";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import prisma from "@/lib/prisma";
import { PERMISSIONS, STANDARD_ROLE_NAMES } from "@/lib/roles";
import { USER_STATUSES } from "@/lib/users";

function learnerReportsUrl(params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) search.set(key, value);
  }

  const query = search.toString();
  return query ? `/admin/reports/learner-progress?${query}` : "/admin/reports/learner-progress";
}

function roleNamesForUser(user: {
  role: string;
  userRoles: Array<{ roleProfile: { name: string } }>;
}) {
  return [...new Set([...user.userRoles.map((item) => item.roleProfile.name), user.role].filter(Boolean))];
}

export async function blockLearnerAsHr(learnerId: string, courseId: string | undefined, _formData: FormData) {
  void _formData;
  const session = await requirePermission(PERMISSIONS.USERS_EDIT_PROFILE);

  const learner = await prisma.user.findUnique({
    where: { id: learnerId },
    select: {
      id: true,
      name: true,
      login: true,
      email: true,
      role: true,
      status: true,
      userRoles: {
        select: {
          roleProfile: {
            select: { name: true },
          },
        },
      },
    },
  });

  if (!learner) {
    redirect(learnerReportsUrl({ error: "Ученик не найден." }));
  }

  if (!roleNamesForUser(learner).includes(STANDARD_ROLE_NAMES.STUDENT)) {
    redirect(learnerReportsUrl({ error: "HR может блокировать только учеников." }));
  }

  if (learner.status === USER_STATUSES.ARCHIVED) {
    redirect(
      learnerReportsUrl({
        userStatus: "blocked",
        q: learner.login,
        error: "Пользователь уже архивирован и недоступен для блокировки.",
      })
    );
  }

  if (learner.status === USER_STATUSES.BLOCKED) {
    redirect(
      learnerReportsUrl({
        userStatus: "blocked",
        q: learner.login,
        notice: "Ученик уже находится в архиве HR.",
      })
    );
  }

  const [directAssignments, groupAssignments] = await Promise.all([
    prisma.courseUserAssignment.findMany({
      where: { userId: learner.id },
      select: { courseId: true },
    }),
    prisma.courseGroupAssignment.findMany({
      where: {
        group: {
          memberships: {
            some: {
              userId: learner.id,
            },
          },
        },
      },
      select: { courseId: true },
    }),
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: learner.id },
      data: {
        status: USER_STATUSES.BLOCKED,
        failedLoginAttempts: 0,
        loginLockedUntil: null,
      },
    });

    await tx.userActivationInvite.updateMany({
      where: {
        userId: learner.id,
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
      },
    });
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "users:block",
    objectType: "user",
    objectId: learner.id,
    objectLabel: learner.name,
    metadata: {
      login: learner.login,
      email: learner.email,
      previousStatus: learner.status,
      nextStatus: USER_STATUSES.BLOCKED,
      source: courseId ? "course_learner_detail" : "learner_report_detail",
    },
  });

  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/learner-progress");
  revalidatePath(`/admin/reports/${learner.id}`);
  revalidatePath("/courses");

  for (const relatedCourseId of new Set([
    ...directAssignments.map((assignment) => assignment.courseId),
    ...groupAssignments.map((assignment) => assignment.courseId),
    ...(courseId ? [courseId] : []),
  ])) {
    revalidatePath(`/courses/${relatedCourseId}/learners`);
    revalidatePath(`/courses/${relatedCourseId}/results`);
    revalidatePath(`/courses/${relatedCourseId}/learners/${learner.id}`);
  }

  redirect(
    learnerReportsUrl({
      userStatus: "blocked",
      q: learner.login,
      notice: `Ученик ${learner.name} заблокирован и перемещен в архив HR.`,
    })
  );
}
