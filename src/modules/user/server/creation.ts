import "server-only";

import bcrypt from "bcryptjs";
import { createUserActivationToken } from "@/lib/user-activations";
import { createCreateUserAccount } from "../application/create-user-account";
import { prismaUserCreationRepository } from "../infrastructure/prisma-user-creation-repository";

// Фасад для транспорта. Инъекция всех side-effect адаптеров: bcrypt, генератор
// токена и системные часы (`Date.now`). Тесты подставляют дешёвые заглушки.

export const createUserAccount = createCreateUserAccount({
  repository: prismaUserCreationRepository,
  hashPassword: (password) => bcrypt.hash(password, 10),
  generateActivationToken: createUserActivationToken,
  now: () => new Date(),
});
