// Ошибки use-case управления ролями. Отдельно от UserApplicationError —
// у ролей своя семантика (форма useActionState vs redirect у пользователей).

export type RoleProfileApplicationErrorCode =
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "SYSTEM_ROLE_RENAME"
  | "SYSTEM_ROLE_DELETE"
  | "ROLE_IN_USE"
  | "UNKNOWN_ROLE"
  | "NO_ROLE_SELECTED"
  | "NAME_TAKEN";

export class RoleProfileApplicationError extends Error {
  constructor(
    readonly code: RoleProfileApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RoleProfileApplicationError";
  }
}
