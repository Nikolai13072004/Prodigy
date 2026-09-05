export type ActivateUserAccountErrorCode = "NOT_FOUND" | "NOT_PENDING" | "EXPIRED";

// Ошибка активации аккаунта по токену (activateUserAccount).
// Транспорт ловит её и показывает message на странице активации (redirect ?error=).
export class ActivateUserAccountError extends Error {
  constructor(
    readonly code: ActivateUserAccountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ActivateUserAccountError";
  }
}
