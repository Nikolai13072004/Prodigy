export type BlockLearnerErrorCode =
  | "NOT_FOUND"
  | "NOT_STUDENT"
  | "ALREADY_ARCHIVED"
  | "ALREADY_BLOCKED";

// Ошибка блокировки ученика HR-ом. Несёт login там, где транспорту нужно
// подставить его в redirect (уже архивирован / уже заблокирован).
export class BlockLearnerError extends Error {
  constructor(
    readonly code: BlockLearnerErrorCode,
    readonly login: string | null,
    message: string,
  ) {
    super(message);
    this.name = "BlockLearnerError";
  }
}
