"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth-guards";
import type { RolePermissionsFormState } from "@/app/admin/roles/role-permissions-form-state";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import prisma from "@/lib/prisma";
import { parsePermissionsJson } from "@/lib/role-profiles";
import { PERMISSIONS, primaryRole, type Permission, normalizePermissions } from "@/lib/roles";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function collectPermissions(formData: FormData): Permission[] {
  const values = formData.getAll("permission").map((value) => String(value));
  return normalizePermissions(values);
}

function serializePermissions(permissions: Permission[]) {
  return JSON.stringify([...new Set(permissions)].sort());
}

function buildRolePermissionsFormState(
  values: { name: string; permissions: Permission[] },
  patch?: Partial<RolePermissionsFormState>
): RolePermissionsFormState {
  return {
    error: patch?.error ?? null,
    success: patch?.success ?? null,
    values,
  };
}

export async function createRoleProfile(_state: RolePermissionsFormState, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
  const name = asString(formData, "name");
  const permissions = collectPermissions(formData);
  const values = { name, permissions };
  if (!name) return buildRolePermissionsFormState(values, { error: "Название роли обязательно" });
  if (permissions.length === 0) return buildRolePermissionsFormState(values, { error: "Выберите хотя бы один доступ" });

  let created;
  try {
    created = await prisma.roleProfile.create({
      data: {
        name,
        permissionsJson: serializePermissions(permissions),
        isSystem: false,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return buildRolePermissionsFormState(values, { error: "Роль с таким названием уже существует" });
    }
    throw error;
  }

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "roles:create",
    objectType: "role",
    objectId: created.id,
    objectLabel: created.name,
    metadata: {
      permissions,
    },
  });

  revalidatePath("/admin/roles");
  redirect(`/admin/roles/${created.id}`);
}

export async function updateRoleProfile(roleId: string, _state: RolePermissionsFormState, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
  const name = asString(formData, "name");
  const permissions = collectPermissions(formData);
  const values = { name, permissions };
  if (!name) return buildRolePermissionsFormState(values, { error: "Название роли обязательно" });
  if (permissions.length === 0) return buildRolePermissionsFormState(values, { error: "Выберите хотя бы один доступ" });

  const current = await prisma.roleProfile.findUnique({
    where: { id: roleId },
    select: { id: true, name: true, isSystem: true, permissionsJson: true },
  });
  if (!current) return buildRolePermissionsFormState(values, { error: "Роль не найдена" });
  if (current.isSystem && name !== current.name) {
    return buildRolePermissionsFormState(values, { error: "Системные роли нельзя переименовывать" });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.roleProfile.update({
        where: { id: roleId },
        data: {
          name,
          permissionsJson: serializePermissions(permissions),
        },
      });

      if (name !== current.name) {
        await tx.user.updateMany({
          where: { role: current.name },
          data: { role: name },
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return buildRolePermissionsFormState(values, { error: "Роль с таким названием уже существует" });
    }
    throw error;
  }

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "roles:update",
    objectType: "role",
    objectId: roleId,
    objectLabel: name,
    metadata: {
      previousName: current.name,
      permissions,
      renamed: name !== current.name,
    },
  });

  revalidatePath("/admin/roles");
  revalidatePath(`/admin/roles/${roleId}`);
  revalidatePath("/admin/users-groups");

  return buildRolePermissionsFormState(values, { success: "Изменения роли сохранены" });
}

export async function deleteRoleProfile(roleId: string, _formData?: FormData) {
  void _formData;
  const session = await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);

  const role = await prisma.roleProfile.findUnique({
    where: { id: roleId },
    select: { id: true, name: true, isSystem: true, permissionsJson: true },
  });
  if (!role) throw new Error("Роль не найдена");
  if (role.isSystem) throw new Error("Системную роль удалять нельзя");

  const usersCount = await prisma.user.count({
    where: {
      OR: [
        { role: role.name },
        {
          userRoles: {
            some: {
              roleProfileId: role.id,
            },
          },
        },
      ],
    },
  });
  if (usersCount > 0) {
    throw new Error("Нельзя удалить роль, пока она назначена пользователям");
  }

  await prisma.roleProfile.delete({ where: { id: roleId } });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "roles:delete",
    objectType: "role",
    objectId: role.id,
    objectLabel: role.name,
    metadata: {
      permissions: parsePermissionsJson(role.permissionsJson),
    },
  });
  revalidatePath("/admin/roles");
  redirect("/admin/roles");
}

export async function setUserRole(userId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
  const roleNames = [...new Set(formData.getAll("role").map((value) => String(value).trim()).filter(Boolean))];
  const roleName = primaryRole(roleNames);
  if (!roleName) throw new Error("Роль не выбрана");

  const roles = await prisma.roleProfile.findMany({
    where: { name: { in: roleNames } },
    select: { id: true, name: true },
  });
  if (roles.length !== roleNames.length) throw new Error("Одна или несколько выбранных ролей не существуют");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { role: roleName },
    }),
    prisma.userRole.deleteMany({ where: { userId } }),
    ...roles.map((role) =>
      prisma.userRole.create({
        data: {
          userId,
          roleProfileId: role.id,
        },
      })
    ),
  ]);

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "users:set_roles",
    objectType: "user",
    objectId: userId,
    objectLabel: roleName,
    metadata: {
      roleNames,
    },
  });

  revalidatePath("/admin/users-groups");
  revalidatePath("/admin/roles");
}

export async function cloneRolePermissions(roleId: string) {
  await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
  const role = await prisma.roleProfile.findUnique({
    where: { id: roleId },
    select: { permissionsJson: true },
  });
  if (!role) return [];
  return parsePermissionsJson(role.permissionsJson);
}
