"use server";

import { appBaseUrl } from "@/lib/app-base-url";
import { unenrollCourseLearner as unenrollCourseLearnerUseCase } from "@/modules/enrollment/server/unenroll-course-learner";
import {
  updateCourseLearnerAccess as updateCourseLearnerAccessUseCase,
  updateCourseLearnersAccessBulk as updateCourseLearnersAccessBulkUseCase,
} from "@/modules/enrollment/server/learner-access";
import { extractBulkAccessSkipDetails } from "@/modules/enrollment/application/update-course-learners-access-bulk";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import {
  asOptionalPositiveInt,
  asPositiveInt,
  asString,
} from "./course-action-input";
import type { UpdateCourseLearnerAccessMode } from "@/modules/enrollment/application/update-course-learner-access";
import type { BulkAccessMode } from "@/modules/enrollment/application/update-course-learners-access-bulk";
import {
  requireCourseWorkspaceAccess,
  requirePermission,
} from "@/lib/auth-guards";
import { auditActorFromSessionUser, getAuditRequestContext, recordAuditEvent } from "@/lib/audit-log";
import { getCourseBroadcastAudience } from "@/lib/course-broadcasts";
import { parseCourseAccessDateInput } from "@/lib/course-access-window";
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
  const rawMode = asString(formData, "mode") || "EXTEND";
  const mode = (rawMode === "SET_DATE" || rawMode === "UNLIMITED" || rawMode === "EXTEND"
    ? rawMode
    : "EXTEND") as UpdateCourseLearnerAccessMode;

  // Ввод даты для SET_DATE валидируем здесь (немедленные redirect на ошибку).
  let requestedExpiresAt: Date | null = null;
  if (mode === "SET_DATE") {
    const parsed = parseCourseAccessDateInput(asString(formData, "accessExpiresOn"));
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
    requestedExpiresAt = parsed;
  }

  const days = asPositiveInt(formData, "days", 30);
  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);

  // Пред-загрузка учителя нужна для отправки письма после use-case.
  const learnerRow = await prisma.user.findUnique({
    where: { id: learnerId },
    select: { name: true, email: true, firstName: true },
  });
  const learnerEmail = learnerRow?.email?.trim() || null;
  const accessEmailQueued = Boolean(learnerEmail);

  let result;
  try {
    result = await updateCourseLearnerAccessUseCase({
      courseId,
      learnerId,
      mode,
      requestedExpiresAt,
      days,
      now: new Date(),
      accessEmailQueued,
      audit: {
        actorId: actor.id,
        actorLogin: actor.login,
        actorName: actor.name,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
    });
  } catch (error) {
    if (error instanceof EnrollmentApplicationError) {
      if (error.code === "COURSE_NOT_FOUND") {
        throw new Error(error.message);
      }
      if (error.code === "NO_ASSIGNMENT") {
        redirect(learnerAccessReturnUrl(courseId, learnerId, formData, "accessError", error.message));
      }
      if (error.code === "ALREADY_UNLIMITED") {
        redirect(learnerAccessReturnUrl(courseId, learnerId, formData, "accessSaved", error.message));
      }
      redirect(learnerAccessReturnUrl(courseId, learnerId, formData, "accessError", error.message));
    }
    throw error;
  }

  if (learnerEmail) {
    await enqueueCourseAccessExtendedEmails(
      [
        {
          email: learnerEmail,
          name: learnerRow?.name ?? null,
          firstName: learnerRow?.firstName ?? null,
        },
      ],
      {
        courseId,
        courseTitle: result.course.title,
        courseUrl: `${appBaseUrl()}/courses/${courseId}`,
        previousAccessLabel: result.previousAccessLabel,
        nextAccessLabel: result.nextAccessLabel,
      }
    );
  }

  revalidateCourseAccessPaths(courseId, [learnerId]);
  redirect(learnerAccessReturnUrl(courseId, learnerId, formData, "accessSaved", result.message));
}

export async function unenrollCourseLearner(courseId: string, learnerId: string, formData: FormData) {
  // ADR-009/013: транспорт — guard, парсинг ввода, вызов use-case, revalidate/redirect.
  const session = await requirePermission(PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS);
  const deleteProgress = asString(formData, "progressDisposition") === "delete";
  const revokeCertificate = asString(formData, "revokeCertificate") === "1";

  const result = await unenrollCourseLearnerUseCase({
    courseId,
    learnerId,
    actor: auditActorFromSessionUser(session.user),
    deleteProgress,
    revokeCertificate,
    now: new Date(),
  });

  if (result.status === "COURSE_NOT_FOUND") {
    redirect(learnersAccessListReturnUrl(courseId, formData, "assignmentError", "Курс не найден."));
  }
  if (result.status === "NO_ASSIGNMENT") {
    redirect(
      learnersAccessListReturnUrl(
        courseId,
        formData,
        "assignmentError",
        "У ученика нет активной или архивной записи на этот курс."
      )
    );
  }

  revalidateCourseAccessPaths(courseId, [learnerId]);
  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/learner-progress");
  revalidatePath(`/admin/reports/${learnerId}`);

  redirect(
    learnersAccessListReturnUrl(
      courseId,
      formData,
      "assignmentSaved",
      result.status === "DONE" && result.deletedProgress
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

  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);

  let result;
  try {
    result = await updateCourseLearnersAccessBulkUseCase({
      courseId,
      learnerIds,
      mode: action.mode as BulkAccessMode,
      requestedExpiresAt,
      days: action.days ?? 0,
      scope,
      now: new Date(),
      audit: {
        actorId: actor.id,
        actorLogin: actor.login,
        actorName: actor.name,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
    });
  } catch (error) {
    if (error instanceof EnrollmentApplicationError && error.code === "COURSE_NOT_FOUND") {
      throw new Error(error.message);
    }
    if (error instanceof EnrollmentApplicationError && error.code === "NOTHING_TO_UPDATE") {
      const skip = extractBulkAccessSkipDetails(error);
      const learnersWithUnlimitedAccess = skip?.learnersWithUnlimitedAccess ?? 0;
      const learnersWithoutAssignments = skip?.learnersWithoutAssignments ?? 0;
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
    throw error;
  }

  revalidateCourseAccessPaths(
    courseId,
    Array.from(new Set([...learnerIds, ...result.updatedLearnerIds]))
  );

  const updatedCountLabel = formatLearnerCount(result.updatedLearnerIds.length);
  const details: string[] = [];
  if (result.learnersWithUnlimitedAccess > 0) {
    details.push(`уже бессрочный доступ: ${result.learnersWithUnlimitedAccess}`);
  }
  if (result.learnersWithoutAssignments > 0) {
    details.push(`без назначений: ${result.learnersWithoutAssignments}`);
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
