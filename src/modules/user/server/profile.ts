import "server-only";

import bcrypt from "bcryptjs";
import { createUpdateUserProfile } from "../application/update-user-profile";
import { prismaUserProfileRepository } from "../infrastructure/prisma-user-profile-repository";

// Фасад для транспорта. bcrypt инжектируется здесь, use-case bcrypt не знает —
// в unit-тестах вместо него подставляется дешёвая заглушка.

export const updateUserProfile = createUpdateUserProfile({
  repository: prismaUserProfileRepository,
  hashPassword: (password) => bcrypt.hash(password, 10),
});
