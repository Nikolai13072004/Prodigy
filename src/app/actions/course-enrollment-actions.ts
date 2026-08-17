"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import {
  asOptionalPositiveInt,
  asPositiveInt,
  asString,
} from "./course-action-input";
import {
  requireCourseWorkspaceAccess,
  requirePermission,
} from "@/lib/auth-guards";
import { auditActorFromSessionUser, getAuditRequestContext, recordAuditEvent } from "@/lib/audit-log";
import { getCourseBroadcastAudience } from "@/lib/course-broadcasts";
import {
  parseCourseAccessDateInput,
  resolveEffectiveCourseAccessWindow,
} from "@/lib/course-access-window";
import {
  getCourseLearnersData,
  getCourseLearnerSortDirection,
  getCourseLearnerSortField,
  getLearnerAccessParam,
  getLearnerStatusParam,
} from "@/lib/course-learners";
import {
  PERMISSIONS,
  STANDARD_ROLE_NAMES,
} from "@/lib/roles";
import { EnrollmentApplicationError } from "@/modules/enrollment/application/errors";
import { changeCourseAssignments } from "@/modules/enrollment/server/change-course-assignments";
import { planInviteRecipients } from "@/modules/enrollment/domain/invite-recipient-plan";
import {
  enqueueCourseAccessExtendedEmails,
  enqueueCourseBroadcastEmails,
} from "@/lib/email/queue";
import { courseInviteExpiresAt, createCourseInviteToken } from "@/lib/course-invites";
import { getPlatformSettings } from "@/lib/platform-settings";
import { USER_STATUSES } from "@/lib/users";

function manageCourseUrl(courseId: string, params?: Record<string, string | undefined>) {
  const base = `/courses/${courseId}/manage`;
  if (!params) return base;
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

function learnerDetailUrl(
  courseId: string,
  learnerId: string,
  params?: Record<string, string | undefined>
) {
  const base = `/courses/${courseId}/learners/${learnerId}`;
  if (!params) return base;
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

function learnersListUrl(courseId: string, params?: Record<string, string | undefined>) {
  const base = `/courses/${courseId}/learners`;
  if (!params) return base;
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

function learnerAccessReturnUrl(
  courseId: string,
  learnerId: string,
  formData: FormData,
  messageKey: "accessSaved" | "accessError" | "assignmentSaved" | "assignmentError",
  message: string
) {
  if (asString(formData, "returnTo") === "learners") {
    return learnersAccessListReturnUrl(courseId, formData, messageKey, message);
  }

  return learnerDetailUrl(courseId, learnerId, { [messageKey]: message });
}

function learnersAccessListReturnUrl(
  courseId: string,
  formData: FormData,
  messageKey: "accessSaved" | "accessError" | "assignmentSaved" | "assignmentError",
  message: string
) {
  return learnersListUrl(courseId, {
    q: asString(formData, "returnQ") || undefined,
    status: asString(formData, "returnStatus") || undefined,
    access: asString(formData, "returnAccess") || undefined,
    sortBy: asString(formData, "returnSortBy") || undefined,
    sortDir: asString(formData, "returnSortDir") || undefined,
    [messageKey]: message,
  });
}

function revalidateCourseAccessPaths(courseId: string, learnerIds: string[]) {
  revalidatePath("/");
  revalidatePath("/courses");
  revalidatePath("/analytics");
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/learners`);
  revalidatePath(`/courses/${courseId}/results`);
  revalidatePath(`/courses/${courseId}/manage`);

  for (const learnerId of learnerIds) {
    revalidatePath(`/courses/${courseId}/learners/${learnerId}`);
  }
}

function formatLearnerCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} ученика`;
  return `${count} учеников`;
}

function parseBulkCourseAccessAction(formData: FormData) {
  const action = asString(formData, "bulkAction");
  if (action === "set-date") return { mode: "SET_DATE" as const, days: null };
  if (action === "unlimited") return { mode: "UNLIMITED" as const, days: null };

  const extendMatch = action.match(/^extend:(\d+)$/);
  if (!extendMatch) return null;

  const days = parseInt(extendMatch[1], 10);
  if (!Number.isFinite(days) || days < 1) return null;

  return { mode: "EXTEND" as const, days };
}

async function resolveBulkLearnerIdsForAccessUpdate(
  courseId: string,
  sessionUser: { id: string; roles: string[]; permissions: string[] },
  formData: FormData
) {
  const bulkScope = asString(formData, "bulkScope") === "filtered" ? "filtered" : "selected";

  if (bulkScope === "filtered") {
    const learnersData = await getCourseLearnersData({
      courseId,
      user: sessionUser,
      q: asString(formData, "returnQ"),
      statusFilter: getLearnerStatusParam(asString(formData, "returnStatus") || null),
      accessFilter: getLearnerAccessParam(asString(formData, "returnAccess") || null),
      sortBy: getCourseLearnerSortField(asString(formData, "returnSortBy") || null),
      sortDir: getCourseLearnerSortDirection(asString(formData, "returnSortDir") || null),
    });

    if (!learnersData || !learnersData.access.canManageAssignments) {
      throw new Error("Недостаточно прав для массового изменения доступа.");
    }

    return {
      learnerIds: learnersData.filteredLearners.map((learner) => learner.id),
      scope: bulkScope,
    } as const;
  }

  return {
    learnerIds: Array.from(
      new Set(
        formData
          .getAll("learnerIds")
          .map((value) => String(value).trim())
          .filter(Boolean)
      )
    ),
    scope: bulkScope,
  } as const;
}

function appBaseUrl() {
  return (
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "http://127.0.0.1:3002"
  );
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDateRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function describeCourseAccessLabel(accessWindow: {
  expiresAt: Date | null;
  isUnlimited: boolean;
  state: "active" | "expired";
} | null) {
  if (!accessWindow) return "Нет доступа";
  if (accessWindow.isUnlimited || !accessWindow.expiresAt) return "Бессрочно";

  const label = `До ${formatDateRu(accessWindow.expiresAt)}`;
  return accessWindow.state === "expired" ? `${label} (истек)` : label;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function parseInviteEmails(raw: string) {
  const values = [...new Set(raw.split(/\r?\n|[;,]+/).flatMap((value) => value.split(",")).map((value) => normalizeEmail(value)).filter(Boolean))];
  const emails: string[] = [];
  const invalidEmails: string[] = [];

  for (const value of values) {
    if (EMAIL_PATTERN.test(value)) emails.push(value);
    else invalidEmails.push(value);
  }

  return { emails, invalidEmails };
}

function summarizeList(values: string[], limit = 5) {
  if (values.length <= limit) return values.join(", ");
  return `${values.slice(0, limit).join(", ")} и еще ${values.length - limit}`;
}

function buildAssignmentWarning(options: {
  invalidEmails: string[];
  blockedEmails: string[];
  nonStudentEmails: string[];
}) {
  const messages: string[] = [];

  if (options.invalidEmails.length) {
    messages.push(`Некорректные email: ${summarizeList(options.invalidEmails)}.`);
  }
  if (options.blockedEmails.length) {
    messages.push(`Не назначены, потому что пользователь заблокирован: ${summarizeList(options.blockedEmails)}.`);
  }
  if (options.nonStudentEmails.length) {
    messages.push(`Не назначены, потому что у пользователя нет роли «Ученик»: ${summarizeList(options.nonStudentEmails)}.`);
  }

  return messages.join(" ");
}

function buildAssignmentSavedMessage(
  assignmentMode: string,
  counts: { userCount: number; groupCount: number; inviteCount: number },
  accessLabel: string
) {
  if (assignmentMode === "CLEAR") return "Назначения очищены";

  const actionLabel = assignmentMode === "REPLACE" ? "Назначения обновлены" : "Назначения сохранены";
  const parts = [`пользователей: ${counts.userCount}`, `групп: ${counts.groupCount}`];
  if (counts.inviteCount > 0) {
    parts.push(`приглашений отправлено: ${counts.inviteCount}`);
  }
  parts.push(`доступ: ${accessLabel}`);

  return `${actionLabel}. ${parts.join(", ")}.`;
}

function resolveRequestedAccessExpiry(formData: FormData) {
  const rawExpiresOn = asString(formData, "accessExpiresOn");
  if (rawExpiresOn) {
    const parsed = parseCourseAccessDateInput(rawExpiresOn);
    if (!parsed) {
      return {
        error: "Не удалось распознать дату окончания доступа.",
        expiresAt: null as Date | null,
        accessLabel: "",
      };
    }
    if (parsed.getTime() <= Date.now()) {
      return {
        error: "Дата окончания доступа должна быть позже текущего момента.",
        expiresAt: null as Date | null,
        accessLabel: "",
      };
    }
    return {
      error: null,
      expiresAt: parsed,
      accessLabel: `до ${formatDateRu(parsed)}`,
    };
  }

  const accessDurationDays = asOptionalPositiveInt(formData, "accessDurationDays");
  if (accessDurationDays) {
    const expiresAt = addDays(new Date(), accessDurationDays);
    return {
      error: null,
      expiresAt,
      accessLabel: `${accessDurationDays} дн. (до ${formatDateRu(expiresAt)})`,
    };
  }

  return {
    error: null,
    expiresAt: null as Date | null,
    accessLabel: "без срока",
  };
}

export async function setCourseAssignments(courseId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS);
  const requestedAssignmentMode = asString(formData, "assignmentMode");
  const assignmentMode = requestedAssignmentMode === "CLEAR" || requestedAssignmentMode === "REPLACE"
    ? requestedAssignmentMode
    : "ADD";
  const selectedUserIds = [...new Set(formData.getAll("userId").map(String).filter(Boolean))];
  const selectedGroupIds = [...new Set(formData.getAll("groupId").map(String).filter(Boolean))];
  const { emails: inviteEmailsFromForm, invalidEmails } = parseInviteEmails(asString(formData, "inviteEmails"));

  const accessRequest =
    assignmentMode === "CLEAR"
      ? {
          error: null as string | null,
          expiresAt: null as Date | null,
          accessLabel: "без срока",
        }
      : resolveRequestedAccessExpiry(formData);

  if (accessRequest.error) {
    redirect(manageCourseUrl(courseId, { assignmentError: accessRequest.error }));
  }

  const accessExpiresAt = accessRequest.expiresAt;
  const accessLabel = accessRequest.accessLabel;

  const existingUsersWithEmail = inviteEmailsFromForm.length
    ? await prisma.user.findMany({
        where: { email: { not: null } },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          firstName: true,
          role: true,
          userRoles: {
            include: {
              roleProfile: {
                select: { name: true },
              },
            },
          },
        },
      })
    : [];

  const invitePlan = planInviteRecipients({
    inviteEmails: inviteEmailsFromForm,
    existingUsers: existingUsersWithEmail.map((user) => ({
      id: user.id,
      email: user.email,
      status: user.status,
      roleNames: [user.role, ...user.userRoles.map((item) => item.roleProfile.name)].filter(Boolean),
    })),
    activeStatus: USER_STATUSES.ACTIVE,
    studentRoleName: STANDARD_ROLE_NAMES.STUDENT,
  });
  const {
    blockedEmails,
    nonStudentEmails,
    pendingInviteEmails,
  } = invitePlan;

  const requestedUserIds = [...new Set([...selectedUserIds, ...invitePlan.directUserIds])];

  const inviteEmailsToCreate = assignmentMode === "CLEAR" ? [] : pendingInviteEmails;
  const inviteEmailsToDelete =
    assignmentMode === "CLEAR" || assignmentMode === "REPLACE"
      ? []
      : [...new Set([...inviteEmailsToCreate, ...invitePlan.existingUserEmails])];

  const platformSettings = inviteEmailsToCreate.length ? await getPlatformSettings() : null;
  const invitePayloads = inviteEmailsToCreate.map((email) => {
    const { token, tokenHash } = createCourseInviteToken();
    return {
      email,
      inviteUrl: `${appBaseUrl()}/invite/${token}`,
      create: {
        courseId,
        email,
        tokenHash,
        invitedById: session.user.id,
        expiresAt: courseInviteExpiresAt(platformSettings?.courseInviteTtlDays),
        accessExpiresAt,
      },
    };
  });
  const auditContext = await getAuditRequestContext();

  const assignmentResult = await changeCourseAssignments({
    courseId,
    actorId: session.user.id,
    mode: assignmentMode,
    requestedDirectUserIds: requestedUserIds,
    requestedGroupIds: selectedGroupIds,
    accessExpiresAt,
    pendingInviteEmailsToReplace: inviteEmailsToDelete,
    pendingInvites: invitePayloads.map((invite) => ({
      email: invite.create.email,
      tokenHash: invite.create.tokenHash,
      expiresAt: invite.create.expiresAt,
      accessExpiresAt: invite.create.accessExpiresAt,
    })),
    effects: {
      actorLogin: session.user.email ?? null,
      actorName: session.user.name ?? null,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      courseUrl: `${appBaseUrl()}/courses/${courseId}`,
      inviteRecipients: invitePayloads.map((invite) => ({
        email: invite.email,
        inviteUrl: invite.inviteUrl,
      })),
      inviteLinkTtlHours: (platformSettings?.courseInviteTtlDays ?? 7) * 24,
      auditMetadata: {
        invalidEmails,
        blockedEmails,
        nonStudentEmails,
        accessLabel,
      },
    },
  }).catch((error: unknown) => {
    if (error instanceof EnrollmentApplicationError) {
      redirect(manageCourseUrl(courseId, { assignmentError: error.message }));
    }
    throw error;
  });
  const finalUserIds = assignmentResult.directUserIds;
  const finalGroupIds = assignmentResult.groupIds;

  revalidatePath("/");
  revalidatePath("/courses");
  revalidatePath("/analytics");
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/learners`);
  revalidatePath(`/courses/${courseId}/results`);
  revalidatePath(`/courses/${courseId}/manage`);
  redirect(
    manageCourseUrl(courseId, {
      assignmentSaved: buildAssignmentSavedMessage(assignmentMode, {
        userCount: finalUserIds.length,
        groupCount: finalGroupIds.length,
        inviteCount: invitePayloads.length,
      }, accessLabel),
      assignmentWarning: buildAssignmentWarning({
        invalidEmails,
        blockedEmails,
        nonStudentEmails,
      }),
    })
  );
}

export async function sendCourseBroadcastMessage(courseId: string, formData: FormData) {
  const access = await requireCourseWorkspaceAccess(courseId);
  if (!access.canManageAssignments) {
    redirect(manageCourseUrl(courseId, {
      section: "assignments",
      messaging: "1",
      messageError: "Для отправки сообщений ученикам нужны права управления назначениями курса.",
    }));
  }

  const audience = await getCourseBroadcastAudience(courseId);
  if (!audience) {
    redirect(manageCourseUrl(courseId, {
      section: "assignments",
      messaging: "1",
      messageError: "Курс не найден.",
    }));
  }

  if (audience.course.status !== "PUBLISHED") {
    redirect(manageCourseUrl(courseId, {
      section: "assignments",
      messaging: "1",
      messageError: "Отправлять сообщения можно только по опубликованному курсу.",
    }));
  }

  const messageSubject = asString(formData, "messageSubject");
  const messageBody = asString(formData, "messageBody");
  const scope = asString(formData, "messageScope") === "group" ? "group" : "course";
  const groupId = asString(formData, "messageGroupId");

  if (!messageSubject) {
    redirect(manageCourseUrl(courseId, {
      section: "assignments",
      messaging: "1",
      messageError: "Укажите тему сообщения.",
    }));
  }

  if (!messageBody) {
    redirect(manageCourseUrl(courseId, {
      section: "assignments",
      messaging: "1",
      messageError: "Введите текст сообщения.",
    }));
  }

  if (messageSubject.length > 200) {
    redirect(manageCourseUrl(courseId, {
      section: "assignments",
      messaging: "1",
      messageError: "Тема сообщения должна быть не длиннее 200 символов.",
    }));
  }

  if (messageBody.length > 5000) {
    redirect(manageCourseUrl(courseId, {
      section: "assignments",
      messaging: "1",
      messageError: "Текст сообщения должен быть не длиннее 5000 символов.",
    }));
  }

  const selectedGroup =
    scope === "group" ? audience.groups.find((group) => group.id === groupId) ?? null : null;

  if (scope === "group" && !selectedGroup) {
    redirect(manageCourseUrl(courseId, {
      section: "assignments",
      messaging: "1",
      messageError: "Выберите группу из числа уже назначенных на курс.",
    }));
  }

  const recipients =
    scope === "group"
      ? audience.recipients.filter((recipient) => recipient.assignedGroupIds.includes(selectedGroup!.id))
      : audience.recipients;

  if (recipients.length === 0) {
    redirect(manageCourseUrl(courseId, {
      section: "assignments",
      messaging: "1",
      messageError:
        scope === "group"
          ? "В выбранной группе нет активных учеников с email для отправки."
          : "По текущим назначениям нет активных учеников с email для отправки.",
    }));
  }

  await enqueueCourseBroadcastEmails(
    recipients.map((recipient) => ({
      email: recipient.email,
      name: recipient.name,
      firstName: recipient.firstName,
    })),
    {
      courseId: audience.course.id,
      courseTitle: audience.course.title,
      courseUrl: `${appBaseUrl()}/courses/${courseId}`,
      messageSubject,
      messageBody,
      groupId: selectedGroup?.id ?? null,
      groupName: selectedGroup?.name ?? null,
    }
  );

  await recordAuditEvent({
    actor: auditActorFromSessionUser(access.session.user),
    action: "courses:send_message",
    objectType: "course",
    objectId: audience.course.id,
    objectLabel: audience.course.title,
    metadata: {
      scope,
      groupId: selectedGroup?.id ?? null,
      groupName: selectedGroup?.name ?? null,
      recipientCount: recipients.length,
      subject: messageSubject,
      bodyLength: messageBody.length,
    },
  });

  revalidatePath(`/courses/${courseId}/manage`);

  redirect(manageCourseUrl(courseId, {
    section: "assignments",
    messageSaved:
      scope === "group"
        ? `Сообщение поставлено в очередь для ${formatLearnerCount(recipients.length)} группы «${selectedGroup!.name}».`
        : `Сообщение поставлено в очередь для ${formatLearnerCount(recipients.length)} курса.`,
  }));
}

export async function updateCourseLearnerAccess(courseId: string, learnerId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS);
  const mode = asString(formData, "mode") || "EXTEND";

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      directAssignments: {
        where: { userId: learnerId },
        select: { expiresAt: true },
      },
      groupAssignments: {
        select: {
          expiresAt: true,
          group: {
            select: {
              memberships: {
                where: { userId: learnerId },
                select: { userId: true },
              },
            },
          },
        },
      },
    },
  });

  if (!course) throw new Error("Курс не найден");

  const learner = await prisma.user.findUnique({
    where: { id: learnerId },
    select: {
      name: true,
      email: true,
      firstName: true,
    },
  });

  const relevantGroupAssignments = course.groupAssignments.filter(
    (assignment) => assignment.group.memberships.length > 0
  );

  if (course.directAssignments.length === 0 && relevantGroupAssignments.length === 0) {
    redirect(learnerAccessReturnUrl(courseId, learnerId, formData, "accessError", "У ученика нет назначений на этот курс."));
  }

  const accessWindow = resolveEffectiveCourseAccessWindow(
    course.directAssignments.map((assignment) => assignment.expiresAt),
    relevantGroupAssignments.map((assignment) => assignment.expiresAt)
  );
  const previousAccessLabel = describeCourseAccessLabel(accessWindow);

  if (mode === "UNLIMITED" && accessWindow?.isUnlimited) {
    redirect(learnerAccessReturnUrl(courseId, learnerId, formData, "accessSaved", "У ученика уже бессрочный доступ."));
  }
  if (mode === "EXTEND" && accessWindow?.isUnlimited) {
    redirect(learnerAccessReturnUrl(courseId, learnerId, formData, "accessSaved", "У ученика уже бессрочный доступ."));
  }

  let expiresAt: Date | null = null;
  let message = "Доступ сделан бессрочным.";

  if (mode === "SET_DATE") {
    const rawExpiresOn = asString(formData, "accessExpiresOn");
    const parsed = parseCourseAccessDateInput(rawExpiresOn);
    if (!parsed) {
      redirect(learnerAccessReturnUrl(courseId, learnerId, formData, "accessError", "Не удалось распознать дату окончания доступа."));
    }
    if (parsed.getTime() <= Date.now()) {
      redirect(
        learnerAccessReturnUrl(
          courseId,
          learnerId,
          formData,
          "accessError",
          "Дата окончания доступа должна быть позже текущего момента."
        )
      );
    }

    expiresAt = parsed;
    message =
      accessWindow?.state === "expired"
        ? `Доступ восстановлен до ${formatDateRu(parsed)}.`
        : `Доступ установлен до ${formatDateRu(parsed)}.`;
  } else if (mode !== "UNLIMITED") {
    const days = asPositiveInt(formData, "days", 30);
    const now = new Date();
    const baseDate =
      accessWindow?.expiresAt && accessWindow.expiresAt.getTime() > now.getTime() ? accessWindow.expiresAt : now;
    expiresAt = addDays(baseDate, days);
    message =
      accessWindow?.state === "expired"
        ? `Доступ восстановлен до ${formatDateRu(expiresAt)}.`
        : `Доступ продлен до ${formatDateRu(expiresAt)}.`;
  }

  const nextAccessWindow = resolveEffectiveCourseAccessWindow(
    [expiresAt],
    relevantGroupAssignments.map((assignment) => assignment.expiresAt)
  );
  const nextAccessLabel = describeCourseAccessLabel(nextAccessWindow);
  message = `${message} Было: ${previousAccessLabel}. Стало: ${nextAccessLabel}.`;

  await prisma.courseUserAssignment.upsert({
    where: {
      courseId_userId: {
        courseId,
        userId: learnerId,
      },
    },
    create: {
      courseId,
      userId: learnerId,
      assignedById: session.user.id,
      expiresAt,
    },
    update: {
      assignedById: session.user.id,
      expiresAt,
    },
  });

  const learnerEmail = learner?.email?.trim() || null;
  const accessEmailQueued = Boolean(learnerEmail);
  if (learnerEmail) {
    await enqueueCourseAccessExtendedEmails(
      [
        {
          email: learnerEmail,
          name: learner?.name ?? null,
          firstName: learner?.firstName ?? null,
        },
      ],
      {
        courseId,
        courseTitle: course.title,
        courseUrl: `${appBaseUrl()}/courses/${courseId}`,
        previousAccessLabel,
        nextAccessLabel,
      }
    );
  }

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "courses:update_access",
    objectType: "course_assignment",
    objectId: `${courseId}:${learnerId}`,
    objectLabel: learnerId,
    metadata: {
      courseId,
      learnerId,
      mode,
      expiresAt,
      previousExpiresAt: accessWindow?.expiresAt?.toISOString() ?? null,
      nextExpiresAt: nextAccessWindow?.expiresAt?.toISOString() ?? null,
      previousAccessLabel,
      nextAccessLabel,
      accessEmailQueued,
      message,
    },
  });

  revalidateCourseAccessPaths(courseId, [learnerId]);
  redirect(learnerAccessReturnUrl(courseId, learnerId, formData, "accessSaved", message));
}

export async function unenrollCourseLearner(courseId: string, learnerId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS);
  const progressDisposition = asString(formData, "progressDisposition") === "delete" ? "delete" : "keep";
  const shouldDeleteProgress = progressDisposition === "delete";

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      items: {
        select: {
          id: true,
          quiz: {
            select: { id: true },
          },
        },
      },
      directAssignments: {
        where: { userId: learnerId },
        select: { userId: true, expiresAt: true },
      },
      groupAssignments: {
        select: {
          groupId: true,
          expiresAt: true,
          group: {
            select: {
              memberships: {
                where: { userId: learnerId },
                select: { userId: true },
              },
            },
          },
        },
      },
    },
  });

  if (!course) {
    redirect(learnersAccessListReturnUrl(courseId, formData, "assignmentError", "Курс не найден."));
  }

  const relevantGroupAssignments = course.groupAssignments.filter(
    (assignment) => assignment.group.memberships.length > 0
  );
  const hadDirectAssignment = course.directAssignments.length > 0;
  const hadGroupAssignment = relevantGroupAssignments.length > 0;

  if (!hadDirectAssignment && !hadGroupAssignment) {
    redirect(
      learnersAccessListReturnUrl(
        courseId,
        formData,
        "assignmentError",
        "У ученика нет активной или архивной записи на этот курс."
      )
    );
  }

  const expiredOverrideAt = new Date(Date.now() - 1_000);
  const courseItemIds = course.items.map((item) => item.id);
  const courseQuizIds = course.items.flatMap((item) => (item.quiz?.id ? [item.quiz.id] : []));

  await prisma.$transaction(async (tx) => {
    if (hadGroupAssignment) {
      await tx.courseUserAssignment.upsert({
        where: {
          courseId_userId: {
            courseId,
            userId: learnerId,
          },
        },
        create: {
          courseId,
          userId: learnerId,
          assignedById: session.user.id,
          expiresAt: expiredOverrideAt,
        },
        update: {
          assignedById: session.user.id,
          expiresAt: expiredOverrideAt,
        },
      });
    } else {
      await tx.courseUserAssignment.deleteMany({
        where: {
          courseId,
          userId: learnerId,
        },
      });
    }

    if (!shouldDeleteProgress) return;

    if (courseItemIds.length > 0) {
      await tx.courseItemView.deleteMany({
        where: {
          userId: learnerId,
          courseItemId: { in: courseItemIds },
        },
      });
    }

    if (courseQuizIds.length > 0) {
      await tx.quizUserBestResult.deleteMany({
        where: {
          userId: learnerId,
          quizId: { in: courseQuizIds },
        },
      });

      await tx.quizAttempt.deleteMany({
        where: {
          userId: learnerId,
          quizId: { in: courseQuizIds },
        },
      });
    }

    await tx.courseFeedback.deleteMany({
      where: {
        courseId,
        userId: learnerId,
      },
    });
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "courses:unenroll_learner",
    objectType: "course_assignment",
    objectId: `${courseId}:${learnerId}`,
    objectLabel: course.title,
    metadata: {
      courseId,
      learnerId,
      hadDirectAssignment,
      hadGroupAssignment,
      progressDisposition,
      overrideExpiresAt: hadGroupAssignment ? expiredOverrideAt.toISOString() : null,
    },
  });

  revalidateCourseAccessPaths(courseId, [learnerId]);
  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/learner-progress");
  revalidatePath(`/admin/reports/${learnerId}`);

  redirect(
    learnersAccessListReturnUrl(
      courseId,
      formData,
      "assignmentSaved",
      shouldDeleteProgress
        ? "Ученик отчислен с курса. Прогресс по курсу удален."
        : "Ученик отчислен с курса. Прогресс по курсу сохранен."
    )
  );
}
export async function updateCourseLearnersAccessBulk(courseId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS);
  const { learnerIds, scope } = await resolveBulkLearnerIdsForAccessUpdate(
    courseId,
    session.user,
    formData
  );

  if (learnerIds.length === 0) {
    redirect(
      learnersAccessListReturnUrl(
        courseId,
        formData,
        "accessError",
        scope === "filtered"
          ? "В текущем фильтре нет учеников для массового изменения доступа."
          : "Выберите хотя бы одного ученика для массового изменения доступа."
      )
    );
  }

  const action = parseBulkCourseAccessAction(formData);
  if (!action) {
    redirect(
      learnersAccessListReturnUrl(
        courseId,
        formData,
        "accessError",
        "Не удалось распознать массовое действие для доступа."
      )
    );
  }

  let requestedExpiresAt: Date | null = null;
  if (action.mode === "SET_DATE") {
    const parsed = parseCourseAccessDateInput(asString(formData, "accessExpiresOn"));
    if (!parsed) {
      redirect(
        learnersAccessListReturnUrl(
          courseId,
          formData,
          "accessError",
          "Укажите корректную дату окончания доступа."
        )
      );
    }
    if (parsed.getTime() <= Date.now()) {
      redirect(
        learnersAccessListReturnUrl(
          courseId,
          formData,
          "accessError",
          "Дата окончания доступа должна быть позже текущего момента."
        )
      );
    }

    requestedExpiresAt = parsed;
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      directAssignments: {
        where: { userId: { in: learnerIds } },
        select: { userId: true, expiresAt: true },
      },
      groupAssignments: {
        select: {
          expiresAt: true,
          group: {
            select: {
              memberships: {
                where: { userId: { in: learnerIds } },
                select: { userId: true },
              },
            },
          },
        },
      },
    },
  });

  if (!course) throw new Error("Курс не найден");

  const directExpiriesByLearnerId = new Map<string, Array<Date | null>>();
  const groupExpiriesByLearnerId = new Map<string, Array<Date | null>>();

  for (const assignment of course.directAssignments) {
    const values = directExpiriesByLearnerId.get(assignment.userId) ?? [];
    values.push(assignment.expiresAt);
    directExpiriesByLearnerId.set(assignment.userId, values);
  }

  for (const assignment of course.groupAssignments) {
    for (const membership of assignment.group.memberships) {
      const values = groupExpiriesByLearnerId.get(membership.userId) ?? [];
      values.push(assignment.expiresAt);
      groupExpiriesByLearnerId.set(membership.userId, values);
    }
  }

  const updates: Array<{ learnerId: string; expiresAt: Date | null }> = [];
  let learnersWithoutAssignments = 0;
  let learnersWithUnlimitedAccess = 0;
  const now = new Date();

  for (const learnerId of learnerIds) {
    const directExpiries = directExpiriesByLearnerId.get(learnerId) ?? [];
    const groupExpiries = groupExpiriesByLearnerId.get(learnerId) ?? [];
    const accessWindow = resolveEffectiveCourseAccessWindow(directExpiries, groupExpiries);

    if (!accessWindow) {
      learnersWithoutAssignments += 1;
      continue;
    }

    if ((action.mode === "UNLIMITED" || action.mode === "EXTEND") && accessWindow.isUnlimited) {
      learnersWithUnlimitedAccess += 1;
      continue;
    }

    if (action.mode === "SET_DATE") {
      updates.push({ learnerId, expiresAt: requestedExpiresAt });
      continue;
    }

    if (action.mode === "UNLIMITED") {
      updates.push({ learnerId, expiresAt: null });
      continue;
    }

    const baseDate =
      accessWindow.expiresAt && accessWindow.expiresAt.getTime() > now.getTime() ? accessWindow.expiresAt : now;
    updates.push({
      learnerId,
      expiresAt: addDays(baseDate, action.days),
    });
  }

  if (updates.length === 0) {
    const details: string[] = [];
    if (learnersWithUnlimitedAccess > 0) {
      details.push(`уже бессрочный доступ: ${learnersWithUnlimitedAccess}`);
    }
    if (learnersWithoutAssignments > 0) {
      details.push(`без назначений: ${learnersWithoutAssignments}`);
    }
    const message =
      details.length > 0
        ? `Изменения не применены: ${details.join(", ")}.`
        : "Изменения не применены.";

    redirect(
      learnersAccessListReturnUrl(
        courseId,
        formData,
        learnersWithUnlimitedAccess > 0 ? "accessSaved" : "accessError",
        message
      )
    );
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.courseUserAssignment.upsert({
        where: {
          courseId_userId: {
            courseId,
            userId: update.learnerId,
          },
        },
        create: {
          courseId,
          userId: update.learnerId,
          assignedById: session.user.id,
          expiresAt: update.expiresAt,
        },
        update: {
          assignedById: session.user.id,
          expiresAt: update.expiresAt,
        },
      })
    )
  );

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "courses:bulk_update_access",
    objectType: "course_assignment",
    objectId: courseId,
    objectLabel: courseId,
    metadata: {
      scope,
      learnerIds,
      updatedLearnerIds: updates.map((update) => update.learnerId),
      mode: action.mode,
      days: action.mode === "EXTEND" ? action.days : null,
      requestedExpiresAt,
      learnersWithoutAssignments,
      learnersWithUnlimitedAccess,
    },
  });

  revalidateCourseAccessPaths(
    courseId,
    Array.from(new Set([...learnerIds, ...updates.map((update) => update.learnerId)]))
  );

  const updatedCountLabel = formatLearnerCount(updates.length);
  const details: string[] = [];
  if (learnersWithUnlimitedAccess > 0) {
    details.push(`уже бессрочный доступ: ${learnersWithUnlimitedAccess}`);
  }
  if (learnersWithoutAssignments > 0) {
    details.push(`без назначений: ${learnersWithoutAssignments}`);
  }

  const message =
    action.mode === "SET_DATE"
      ? `Срок доступа обновлен для ${updatedCountLabel}${scope === "filtered" ? " из текущего фильтра" : ""} до ${formatDateRu(requestedExpiresAt!)}.`
      : action.mode === "UNLIMITED"
        ? `Бессрочный доступ включен для ${updatedCountLabel}${scope === "filtered" ? " из текущего фильтра" : ""}.`
        : `Доступ продлен для ${updatedCountLabel}${scope === "filtered" ? " из текущего фильтра" : ""} на ${action.days} дн.`;

  redirect(
    learnersAccessListReturnUrl(
      courseId,
      formData,
      "accessSaved",
      details.length > 0 ? `${message} Дополнительно: ${details.join(", ")}.` : message
    )
  );
}
