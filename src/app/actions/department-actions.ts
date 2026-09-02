"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-guards";
import {
  auditActorFromSessionUser,
  getAuditRequestContext,
} from "@/lib/audit-log";
import { PERMISSIONS } from "@/lib/roles";
import { departments } from "@/modules/org-structure/server/departments";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

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

export async function createDepartment(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.DEPARTMENTS_CREATE_EDIT);
  const { actor, audit } = await actorContext(session.user);
  await departments.create({ name: asString(formData, "name"), actor, audit });
  revalidatePath("/admin/departments");
}

export async function updateDepartment(departmentId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.DEPARTMENTS_CREATE_EDIT);
  const { actor, audit } = await actorContext(session.user);
  await departments.update({
    id: departmentId,
    name: asString(formData, "name"),
    actor,
    audit,
  });
  revalidatePath("/admin/departments");
}

export async function deleteDepartment(departmentId: string, _formData?: FormData) {
  void _formData;
  const session = await requirePermission(PERMISSIONS.DEPARTMENTS_DELETE);
  const { actor, audit } = await actorContext(session.user);
  await departments.remove({ id: departmentId, actor, audit });
  revalidatePath("/admin/departments");
}
