export type ContentApplicationErrorCode =
  | "INVALID_INPUT"
  | "MODULE_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "NO_MOVE";

export class ContentApplicationError extends Error {
  constructor(readonly code: ContentApplicationErrorCode, message: string) {
    super(message);
    this.name = "ContentApplicationError";
  }
}
