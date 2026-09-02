import "server-only";

import { parsePermissionsJson } from "@/lib/role-profiles";
import { createManageRoleProfiles } from "../application/manage-role-profiles";
import { prismaRoleProfileRepository } from "../infrastructure/prisma-role-profile-repository";

const manager = createManageRoleProfiles({
  repository: prismaRoleProfileRepository,
});

export const createRole = manager.createRole;
export const updateRole = manager.updateRole;
export const deleteRole = manager.deleteRole;
export const setUserRole = manager.setUserRole;

// Read-only: разрешения роли для копирования в форму создания новой роли.
export async function loadRolePermissions(roleId: string) {
  const role = await prismaRoleProfileRepository.findRoleById(roleId);
  if (!role) return [];
  return parsePermissionsJson(role.permissionsJson);
}
