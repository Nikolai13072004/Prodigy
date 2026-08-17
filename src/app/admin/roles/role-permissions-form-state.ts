import type { Permission } from "@/lib/roles";

export type RolePermissionsFormValues = {
  name: string;
  permissions: Permission[];
};

export type RolePermissionsFormState = {
  error: string | null;
  success: string | null;
  values: RolePermissionsFormValues | null;
};

export const INITIAL_ROLE_PERMISSIONS_FORM_STATE: RolePermissionsFormState = {
  error: null,
  success: null,
  values: null,
};
