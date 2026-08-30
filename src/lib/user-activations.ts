import { createHash, randomBytes } from "crypto";

export const DEFAULT_USER_ACTIVATION_TTL_DAYS = 7;
export const USER_ACTIVATION_TTL_DAYS = DEFAULT_USER_ACTIVATION_TTL_DAYS;

export function hashUserActivationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createUserActivationToken() {
  const token = randomBytes(24).toString("hex");
  return {
    token,
    tokenHash: hashUserActivationToken(token),
  };
}

export function userActivationExpiresAt(ttlDays = DEFAULT_USER_ACTIVATION_TTL_DAYS, from = new Date()) {
  return new Date(from.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}
