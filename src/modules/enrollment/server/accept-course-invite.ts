import "server-only";

import bcrypt from "bcryptjs";
import { createAcceptCourseInvite } from "../application/accept-course-invite";
import { prismaCourseInviteRepository } from "../infrastructure/prisma-course-invite-repository";

export const courseInvites = createAcceptCourseInvite({
  repository: prismaCourseInviteRepository,
  hashPassword: (password) => bcrypt.hash(password, 10),
});
