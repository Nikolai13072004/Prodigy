// Ошибки use-case оргструктуры (подразделения / организации).

export type OrgStructureApplicationErrorCode =
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "NAME_TAKEN";

export class OrgStructureApplicationError extends Error {
  constructor(
    readonly code: OrgStructureApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OrgStructureApplicationError";
  }
}
