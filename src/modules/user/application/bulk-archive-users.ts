import { USER_STATUSES } from "@/lib/users";
import { planBulkArchive } from "../domain/bulk-archive";
import type {
  UserAudit,
  UserLifecycleRepository,
  UserRecord,
} from "./ports";

// Use-case: массовое архивирование. Само решение «кого архивируем и был ли
// пропущен текущий пользователь» — чистая функция planBulkArchive.
// Ответственность use-case: собрать данные, отдать решение domain,
// применить его в одной транзакции с аудитом.

export type BulkArchiveAuditContext = {
  actorId: string;
  actorLogin: string | null;
  actorName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type BulkArchiveUsersCommand = {
  requestedUserIds: string[];
  currentUserId: string;
  audit: BulkArchiveAuditContext;
};

export type BulkArchiveUsersResult =
  | { status: "NOTHING_TO_ARCHIVE"; skippedCurrentUser: boolean }
  | {
      status: "ARCHIVED";
      archivedCount: number;
      requestedCount: number;
      skippedCurrentUser: boolean;
      archivedUsers: UserRecord[];
    };

export type BulkArchiveUsersDeps = {
  repository: UserLifecycleRepository;
};

// Ограничиваем размер metadata: подряд 100 пользователей — предел, как в
// прежней реализации action; больше в лог не имеет смысла тащить.
const AUDIT_USER_SAMPLE_SIZE = 100;

export function createBulkArchiveUsers(deps: BulkArchiveUsersDeps) {
  const { repository } = deps;

  return async function bulkArchiveUsers(
    command: BulkArchiveUsersCommand,
  ): Promise<BulkArchiveUsersResult> {
    const requestedUserIds = [...new Set(command.requestedUserIds)];
    if (requestedUserIds.length === 0) {
      return { status: "NOTHING_TO_ARCHIVE", skippedCurrentUser: false };
    }

    return repository.transact(async (tx) => {
      const users = await tx.findUsersByIds(requestedUserIds);
      const { skippedCurrentUser, archiveUserIds } = planBulkArchive(
        users,
        command.currentUserId,
      );

      if (archiveUserIds.length === 0) {
        return {
          status: "NOTHING_TO_ARCHIVE",
          skippedCurrentUser,
        };
      }

      await tx.changeUserStatuses(archiveUserIds, USER_STATUSES.ARCHIVED);
      await tx.cancelPendingInvites(archiveUserIds);

      const archivedUsers = users.filter((user) =>
        archiveUserIds.includes(user.id),
      );

      const audit: UserAudit = {
        actorId: command.audit.actorId,
        actorLogin: command.audit.actorLogin,
        actorName: command.audit.actorName,
        action: "users:bulk_archive",
        objectType: "user_batch",
        objectId: null,
        objectLabel: `bulk_archive_${archiveUserIds.length}`,
        ipAddress: command.audit.ipAddress,
        userAgent: command.audit.userAgent,
        metadata: {
          requestedCount: requestedUserIds.length,
          archivedCount: archiveUserIds.length,
          skippedCurrentUser,
          users: archivedUsers
            .slice(0, AUDIT_USER_SAMPLE_SIZE)
            .map((user) => ({
              id: user.id,
              login: user.login,
              email: user.email,
              previousStatus: user.status,
            })),
        },
      };
      await tx.recordEffects({ audit });

      return {
        status: "ARCHIVED",
        archivedCount: archiveUserIds.length,
        requestedCount: requestedUserIds.length,
        skippedCurrentUser,
        archivedUsers,
      };
    });
  };
}
