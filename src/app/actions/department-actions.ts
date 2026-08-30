"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-guards";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import prisma from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/roles";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createDepartment(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.DEPARTMENTS_CREATE_EDIT);
  const name = asString(formData, "name");
  if (!name) throw new Error("Название подразделения обязательно");

  const department = await prisma.department.create({ data: { name } });
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "departments:create",
    objectType: "department",
    objectId: department.id,
    objectLabel: department.name,
  });
  revalidatePath("/admin/departments");
}

export async function updateDepartment(departmentId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.DEPARTMENTS_CREATE_EDIT);
  const name = asString(formData, "name");
  if (!name) throw new Error("Название подразделения обязательно");

  const existing = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true },
  });
  if (!existing) throw new Error("Подразделение не найдено");

  await prisma.department.update({
    where: { id: departmentId },
    data: { name },
  });
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "departments:update",
    objectType: "department",
    objectId: departmentId,
    objectLabel: name,
    metadata: {
      previousName: existing.name,
    },
  });
  revalidatePath("/admin/departments");
}

export async function deleteDepartment(departmentId: string, _formData?: FormData) {
  void _formData;
  const session = await requirePermission(PERMISSIONS.DEPARTMENTS_DELETE);
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true },
  });
  if (!department) throw new Error("Подразделение не найдено");

  await prisma.department.delete({ where: { id: departmentId } });
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "departments:delete",
    objectType: "department",
    objectId: department.id,
    objectLabel: department.name,
  });
  revalidatePath("/admin/departments");
}
