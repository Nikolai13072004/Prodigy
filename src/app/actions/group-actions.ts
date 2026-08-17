"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guards";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import { PERMISSIONS, STANDARD_ROLE_NAMES } from "@/lib/roles";
import { USER_STATUSES } from "@/lib/users";
import { asOptionalString, asString } from "./course-action-input";

export async function createGroup(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.GROUPS_CREATE);
  const name = asString(formData, "name");
  const description = asOptionalString(formData, "description");
  if (!name) redirect(usersGroupsUrl({ groupError: "Название группы обязательно." }));
  let group: { id: string; name: string };
  try {
    group = await prisma.group.create({ data: { name, description }, select: { id: true, name: true } });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002") {
      redirect(usersGroupsUrl({ groupError: "Группа с таким названием уже существует." }));
    }
    console.error("Failed to create group", error);
    redirect(usersGroupsUrl({ groupError: "Не удалось создать группу. Попробуйте еще раз." }));
  }
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "groups:create",
    objectType: "group",
    objectId: group.id,
    objectLabel: group.name,
    metadata: { description },
  });
  revalidatePath("/");
  revalidatePath("/admin/users-groups");
  redirect(usersGroupsUrl({ groupId: group.id, groupNotice: "Группа создана." }));
}

export async function updateGroup(groupId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.GROUPS_EDIT);
  const groupCourseId = asOptionalString(formData, "groupCourseId") ?? undefined;
  const name = asString(formData, "name");
  const description = asOptionalString(formData, "description");
  if (!name) redirect(usersGroupsUrl({ groupId, groupCourseId, groupError: "Название группы обязательно." }));
  const current = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, description: true },
  });
  if (!current) redirect(usersGroupsUrl({ groupCourseId, groupError: "Группа не найдена." }));
  try {
    await prisma.group.update({ where: { id: groupId }, data: { name, description } });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002") {
      redirect(usersGroupsUrl({ groupId, groupCourseId, groupError: "Группа с таким названием уже существует." }));
    }
    console.error("Failed to update group", error);
    redirect(usersGroupsUrl({ groupId, groupCourseId, groupError: "Не удалось сохранить группу. Попробуйте еще раз." }));
  }
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "groups:update",
    objectType: "group",
    objectId: groupId,
    objectLabel: name,
    metadata: {
      previousName: current.name,
      previousDescription: current.description,
      description,
    },
  });
  revalidatePath("/");
  revalidatePath("/admin/users-groups");
  redirect(usersGroupsUrl({ groupId, groupCourseId, groupNotice: "Карточка группы сохранена." }));
}

export async function setGroupMembers(groupId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.GROUPS_EDIT);
  const groupCourseId = asOptionalString(formData, "groupCourseId") ?? undefined;
  const selectedUserIds = [...new Set(formData.getAll("userId").map(String).filter(Boolean))];
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      memberships: { select: { userId: true } },
      courseAssignments: { select: { courseId: true } },
    },
  });
  if (!group) redirect(usersGroupsUrl({ groupCourseId, groupError: "Группа не найдена." }));
  if (selectedUserIds.length > 0) {
    const students = await prisma.user.findMany({
      where: {
        id: { in: selectedUserIds },
        status: { notIn: [USER_STATUSES.BLOCKED, USER_STATUSES.ARCHIVED] },
        OR: [
          { role: STANDARD_ROLE_NAMES.STUDENT },
          { userRoles: { some: { roleProfile: { name: STANDARD_ROLE_NAMES.STUDENT } } } },
        ],
      },
      select: { id: true },
    });
    if (students.length !== selectedUserIds.length) {
      redirect(usersGroupsUrl({ groupId, groupCourseId, groupError: "В группу можно добавлять только активных учеников." }));
    }
  }
  const previousUserIds = group.memberships.map((membership) => membership.userId);
  const affectedUserIds = [...new Set([...previousUserIds, ...selectedUserIds])];
  await prisma.$transaction(async (tx) => {
    await tx.groupMembership.deleteMany({ where: { groupId } });
    if (selectedUserIds.length) {
      await tx.groupMembership.createMany({ data: selectedUserIds.map((userId) => ({ groupId, userId })) });
    }
    await tx.auditLogEvent.create({
      data: {
        actorId: session.user.id,
        actorLogin: session.user.email ?? null,
        actorName: session.user.name ?? null,
        action: "groups:set_memberships",
        objectType: "group",
        objectId: group.id,
        objectLabel: group.name,
        metadataJson: JSON.stringify({ previousUserIds, nextUserIds: selectedUserIds }),
      },
    });
  });
  revalidateGroupMemberships(group.courseAssignments.map((assignment) => assignment.courseId), affectedUserIds);
  redirect(usersGroupsUrl({
    groupId,
    groupCourseId,
    groupNotice: selectedUserIds.length
      ? `Состав группы обновлен: ${selectedUserIds.length} учеников.`
      : "Группа очищена. Участники удалены.",
  }));
}

function usersGroupsUrl(params?: Record<string, string | undefined>) {
  const search = new URLSearchParams({ tab: "groups" });
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  return `/admin/users-groups?${search.toString()}#groups-section`;
}

function prismaErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String(error.code) : "";
}

function revalidateGroupMemberships(courseIds: string[], userIds: string[]) {
  for (const path of ["/", "/admin/users-groups", "/admin/reports", "/admin/reports/learner-progress", "/courses", "/analytics"]) {
    revalidatePath(path);
  }
  for (const userId of userIds) {
    revalidatePath(`/admin/users/${userId}/edit`);
    revalidatePath(`/admin/reports/${userId}`);
  }
  for (const courseId of courseIds) {
    revalidatePath(`/courses/${courseId}`);
    revalidatePath(`/courses/${courseId}/learners`);
    revalidatePath(`/courses/${courseId}/results`);
    revalidatePath(`/courses/${courseId}/manage`);
  }
}
