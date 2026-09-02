export type GroupApplicationErrorCode =
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "NAME_TAKEN"
  | "INELIGIBLE_MEMBERS";

export class GroupApplicationError extends Error {
  constructor(
    readonly code: GroupApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GroupApplicationError";
  }
}
