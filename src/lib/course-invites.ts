import { createHash, randomBytes } from "crypto";

export const DEFAULT_COURSE_INVITE_TTL_DAYS = 7;
export const COURSE_INVITE_TTL_DAYS = DEFAULT_COURSE_INVITE_TTL_DAYS;

export function hashCourseInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createCourseInviteToken() {
  const token = randomBytes(24).toString("hex");
  return {
    token,
    tokenHash: hashCourseInviteToken(token),
  };
}

export function courseInviteExpiresAt(ttlDays = DEFAULT_COURSE_INVITE_TTL_DAYS, from = new Date()) {
  return new Date(from.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}
