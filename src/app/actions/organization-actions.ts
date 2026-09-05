"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-guards";
import {
  auditActorFromSessionUser,
  getAuditRequestContext,
} from "@/lib/audit-log";
import { PERMISSIONS } from "@/lib/roles";
import { organizations } from "@/modules/org-structure/server/organizations";

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

export async function createOrganization(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.ORGANIZATIONS_CREATE_EDIT);
  const { actor, audit } = await actorContext(session.user);
  await organizations.create({ name: asString(formData, "name"), actor, audit });
  revalidatePath("/admin/organizations");
}

export async function updateOrganization(organizationId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.ORGANIZATIONS_CREATE_EDIT);
  const { actor, audit } = await actorContext(session.user);
  await organizations.update({
    id: organizationId,
    name: asString(formData, "name"),
    actor,
    audit,
  });
  revalidatePath("/admin/organizations");
}

export async function deleteOrganization(organizationId: string, _formData?: FormData) {
  void _formData;
  const session = await requirePermission(PERMISSIONS.ORGANIZATIONS_DELETE);
  const { actor, audit } = await actorContext(session.user);
  await organizations.remove({ id: organizationId, actor, audit });
  revalidatePath("/admin/organizations");
}
