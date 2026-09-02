// Ошибки уровня application для модуля user (ADR-013).
// Транспорт (server action) распознаёт код и превращает его в редирект/сообщение,
// сам use-case не знает про redirect/URL.

export type UserApplicationErrorCode =
  | "NOT_FOUND"
  | "SELF_BLOCK"
  | "ALREADY_ARCHIVED"
  | "NOT_ARCHIVED"
  // Единый код для валидационных отказов updateUser: use-case уже сформировал
  // готовое пользовательское сообщение, транспорт кладёт его в редирект.
  | "VALIDATION_FAILED"
  // HR попытался выполнить операцию над не-учеником: транспорт ведёт в список
  // пользователей, а не в форму редактирования (иная семантика от VALIDATION).
  | "HR_FORBIDDEN";

export class UserApplicationError extends Error {
  constructor(
    readonly code: UserApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UserApplicationError";
  }
}
