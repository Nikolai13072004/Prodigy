import "server-only";

import { prismaUserLifecycleRepository } from "../infrastructure/prisma-user-lifecycle-repository";
import { createArchiveUser } from "../application/archive-user";
import { createBulkArchiveUsers } from "../application/bulk-archive-users";
import { createPermanentlyDeleteUser } from "../application/permanently-delete-user";
import { createRestoreUser } from "../application/restore-user";

// Фасад с уже инжектированной инфраструктурой — импортируется server action'ами.
// Тесты вызывают use-case напрямую с фейковым репозиторием.

export const archiveUser = createArchiveUser({
  repository: prismaUserLifecycleRepository,
});

export const restoreUser = createRestoreUser({
  repository: prismaUserLifecycleRepository,
});

export const bulkArchiveUsers = createBulkArchiveUsers({
  repository: prismaUserLifecycleRepository,
});

export const permanentlyDeleteUser = createPermanentlyDeleteUser({
  repository: prismaUserLifecycleRepository,
});
