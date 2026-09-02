import "server-only";

import { prismaUserImportRepository } from "../infrastructure/prisma-user-import-repository";

export const userImport = prismaUserImportRepository;
