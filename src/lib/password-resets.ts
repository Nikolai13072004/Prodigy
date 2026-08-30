import { createHash, randomBytes } from "crypto";

export const DEFAULT_PASSWORD_RESET_TTL_MINUTES = 60;

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createPasswordResetToken() {
  const token = randomBytes(24).toString("hex");
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
  };
}

export function passwordResetExpiresAt(
  ttlMinutes = DEFAULT_PASSWORD_RESET_TTL_MINUTES,
  from = new Date(),
) {
  return new Date(from.getTime() + ttlMinutes * 60 * 1000);
}

export function passwordResetTtlLabel(ttlMinutes = DEFAULT_PASSWORD_RESET_TTL_MINUTES) {
  if (ttlMinutes % 60 === 0) {
    const hours = ttlMinutes / 60;
    if (hours === 1) return "1 час";
    if (hours >= 2 && hours <= 4) return `${hours} часа`;
    return `${hours} часов`;
  }

  if (ttlMinutes === 1) return "1 минуту";
  if (ttlMinutes >= 2 && ttlMinutes <= 4) return `${ttlMinutes} минуты`;
  return `${ttlMinutes} минут`;
}
