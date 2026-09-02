export type AcceptCourseInviteErrorCode =
  | "VALIDATION_FAILED"
  | "INVITE_NOT_FOUND"
  | "INVITE_REJECTED"
  | "INVITE_EXPIRED"
  | "EXISTING_USER_CONFLICT"
  | "LOGIN_TAKEN"
  | "REGISTRATION_CONFLICT";

// Ошибка приёма приглашения на курс. Транспорт ловит её и показывает message
// на странице приглашения (redirect ?error=...). Код — на случай, если позже
// понадобится разная реакция; сейчас все ветки ведут к одному inviteError.
export class AcceptCourseInviteError extends Error {
  constructor(
    readonly code: AcceptCourseInviteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AcceptCourseInviteError";
  }
}
