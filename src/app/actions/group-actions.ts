"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth-guards";
import {
  auditActorFromSessionUser,
  getAuditRequestContext,
} from "@/lib/audit-log";
import { PERMISSIONS } from "@/lib/roles";
import { GroupApplicationError } from "@/modules/group/application/errors";
import { groups } from "@/modules/group/server/groups";
import { asOptionalString, asString } from "./course-action-input";

async function actorContext(
  sessionUser: Parameters<typeof auditActorFromSessionUser>[0],
) {
  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(sessionUser);
  return {
    actor: { id: actor.id, login: actor.login, name: actor.name },
    audit: {
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    },
  };
}

export async function createGroup(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.GROUPS_CREATE);
  const { actor, audit } = await actorContext(session.user);
  let group;
  try {
    group = await groups.create({
      name: asString(formData, "name"),
      description: asOptionalString(formData, "description"),
      actor,
      audit,
    });
  } catch (error) {
    if (error instanceof GroupApplicationError) {
      redirect(usersGroupsUrl({ groupError: error.message }));
    }
    console.error("Failed to create group", error);
    redirect(usersGroupsUrl({ groupError: "Не удалось создать группу. Попробуйте еще раз." }));
  }

  revalidatePath("/");
  revalidatePath("/admin/users-groups");
  redirect(usersGroupsUrl({ groupId: group.id, groupNotice: "Группа создана." }));
}

export async function updateGroup(groupId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.GROUPS_EDIT);
  const groupCourseId = asOptionalString(formData, "groupCourseId") ?? undefined;
  const { actor, audit } = await actorContext(session.user);
  try {
    await groups.update({
      id: groupId,
      name: asString(formData, "name"),
      description: asOptionalString(formData, "description"),
      actor,
      audit,
    });
  } catch (error) {
    if (error instanceof GroupApplicationError) {
      if (error.code === "NOT_FOUND") {
        redirect(usersGroupsUrl({ groupCourseId, groupError: error.message }));
      }
      redirect(usersGroupsUrl({ groupId, groupCourseId, groupError: error.message }));
    }
    console.error("Failed to update group", error);
    redirect(usersGroupsUrl({ groupId, groupCourseId, groupError: "Не удалось сохранить группу. Попробуйте еще раз." }));
  }

  revalidatePath("/");
  revalidatePath("/admin/users-groups");
  redirect(usersGroupsUrl({ groupId, groupCourseId, groupNotice: "Карточка группы сохранена." }));
}

export async function setGroupMembers(groupId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.GROUPS_EDIT);
  const groupCourseId = asOptionalString(formData, "groupCourseId") ?? undefined;
  const selectedUserIds = [...new Set(formData.getAll("userId").map(String).filter(Boolean))];
  const { actor, audit } = await actorContext(session.user);

  let result;
  try {
    result = await groups.setMembers({ id: groupId, selectedUserIds, actor, audit });
  } catch (error) {
    if (error instanceof GroupApplicationError) {
      if (error.code === "NOT_FOUND") {
        redirect(usersGroupsUrl({ groupCourseId, groupError: error.message }));
      }
      redirect(usersGroupsUrl({ groupId, groupCourseId, groupError: error.message }));
    }
    throw error;
  }

  revalidateGroupMemberships(result.courseIds, result.affectedUserIds);
  redirect(usersGroupsUrl({
    groupId,
    groupCourseId,
    groupNotice: result.selectedCount
      ? `Состав группы обновлен: ${result.selectedCount} учеников.`
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
