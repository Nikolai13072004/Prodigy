"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth-guards";
import type { RolePermissionsFormState } from "@/app/admin/roles/role-permissions-form-state";
import {
  auditActorFromSessionUser,
  getAuditRequestContext,
} from "@/lib/audit-log";
import { PERMISSIONS, primaryRole, type Permission, normalizePermissions } from "@/lib/roles";
import { RoleProfileApplicationError } from "@/modules/user/application/role-profile-errors";
import {
  createRole as createRoleUseCase,
  deleteRole as deleteRoleUseCase,
  loadRolePermissions,
  setUserRole as setUserRoleUseCase,
  updateRole as updateRoleUseCase,
} from "@/modules/user/server/roles";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function collectPermissions(formData: FormData): Permission[] {
  const values = formData.getAll("permission").map((value) => String(value));
  return normalizePermissions(values);
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

async function roleActorContext(sessionUser: Parameters<typeof auditActorFromSessionUser>[0]) {
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

export async function createRoleProfile(_state: RolePermissionsFormState, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
  const name = asString(formData, "name");
  const permissions = collectPermissions(formData);
  const values = { name, permissions };
  const { actor, audit } = await roleActorContext(session.user);

  let created;
  try {
    created = await createRoleUseCase({ name, permissions, actor, audit });
  } catch (error) {
    if (error instanceof RoleProfileApplicationError) {
      return buildRolePermissionsFormState(values, { error: error.message });
    }
    throw error;
  }

  revalidatePath("/admin/roles");
  redirect(`/admin/roles/${created.roleId}`);
}

export async function updateRoleProfile(roleId: string, _state: RolePermissionsFormState, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
  const name = asString(formData, "name");
  const permissions = collectPermissions(formData);
  const values = { name, permissions };
  const { actor, audit } = await roleActorContext(session.user);

  try {
    await updateRoleUseCase({ roleId, name, permissions, actor, audit });
  } catch (error) {
    if (error instanceof RoleProfileApplicationError) {
      return buildRolePermissionsFormState(values, { error: error.message });
    }
    throw error;
  }

  revalidatePath("/admin/roles");
  revalidatePath(`/admin/roles/${roleId}`);
  revalidatePath("/admin/users-groups");

  return buildRolePermissionsFormState(values, { success: "Изменения роли сохранены" });
}

export async function deleteRoleProfile(roleId: string, _formData?: FormData) {
  void _formData;
  const session = await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
  const { actor, audit } = await roleActorContext(session.user);

  try {
    await deleteRoleUseCase({ roleId, actor, audit });
  } catch (error) {
    if (error instanceof RoleProfileApplicationError) {
      throw new Error(error.message);
    }
    throw error;
  }

  revalidatePath("/admin/roles");
  redirect("/admin/roles");
}

export async function setUserRole(userId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
  const roleNames = [
    ...new Set(
      formData.getAll("role").map((value) => String(value).trim()).filter(Boolean),
    ),
  ];
  const primaryRoleName = primaryRole(roleNames) ?? "";
  const { actor, audit } = await roleActorContext(session.user);

  try {
    await setUserRoleUseCase({
      userId,
      roleNames,
      primaryRoleName,
      actor,
      audit,
    });
  } catch (error) {
    if (error instanceof RoleProfileApplicationError) {
      throw new Error(error.message);
    }
    throw error;
  }

  revalidatePath("/admin/users-groups");
  revalidatePath("/admin/roles");
}

export async function cloneRolePermissions(roleId: string) {
  await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
  return loadRolePermissions(roleId);
}
