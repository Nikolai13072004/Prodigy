"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-guards";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import prisma from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/roles";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createOrganization(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.ORGANIZATIONS_CREATE_EDIT);
  const name = asString(formData, "name");
  if (!name) throw new Error("Название организации обязательно");

  const organization = await prisma.organization.create({ data: { name } });
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "organizations:create",
    objectType: "organization",
    objectId: organization.id,
    objectLabel: organization.name,
  });
  revalidatePath("/admin/organizations");
}

export async function updateOrganization(organizationId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.ORGANIZATIONS_CREATE_EDIT);
  const name = asString(formData, "name");
  if (!name) throw new Error("Название организации обязательно");

  const existing = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!existing) throw new Error("Организация не найдена");

  await prisma.organization.update({
    where: { id: organizationId },
    data: { name },
  });
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "organizations:update",
    objectType: "organization",
    objectId: organizationId,
    objectLabel: name,
    metadata: {
      previousName: existing.name,
    },
  });
  revalidatePath("/admin/organizations");
}

export async function deleteOrganization(organizationId: string, _formData?: FormData) {
  void _formData;
  const session = await requirePermission(PERMISSIONS.ORGANIZATIONS_DELETE);
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!organization) throw new Error("Организация не найдена");

  await prisma.organization.delete({ where: { id: organizationId } });
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "organizations:delete",
    objectType: "organization",
    objectId: organization.id,
    objectLabel: organization.name,
  });
  revalidatePath("/admin/organizations");
}
