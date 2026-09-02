export type SelfServicePasswordResetErrorCode =
  | "NOT_FOUND"
  | "NOT_PENDING"
  | "EXPIRED"
  | "ACCESS_REVOKED";

// Ошибка самостоятельного сброса пароля по токену (resetPasswordWithToken).
// Транспорт ловит её и показывает message на странице сброса (redirect ?error=).
export class SelfServicePasswordResetError extends Error {
  constructor(
    readonly code: SelfServicePasswordResetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SelfServicePasswordResetError";
  }
}
