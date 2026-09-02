import { GroupApplicationError } from "./errors";
import type {
  GroupAudit,
  GroupMembershipContext,
  GroupRecord,
  GroupRepository,
} from "./ports";

// Use-case-набор модуля групп: создание/обновление карточки и замена состава
// участников (только активные ученики). Аудит — в той же транзакции.

export type GroupActor = {
  id: string;
  login: string | null;
  name: string | null;
};

export type GroupAuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type SetGroupMembersResult = {
  previousUserIds: string[];
  affectedUserIds: string[];
  courseIds: string[];
  selectedCount: number;
};

export type ManageGroupsDeps = {
  repository: GroupRepository;
};

function buildAudit(
  actor: GroupActor,
  ctx: GroupAuditContext,
  action: string,
  record: GroupRecord,
  metadata?: unknown,
): GroupAudit {
  return {
    actorId: actor.id,
    actorLogin: actor.login,
    actorName: actor.name,
    action,
    objectType: "group",
    objectId: record.id,
    objectLabel: record.name,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata,
  };
}

export function createManageGroups(deps: ManageGroupsDeps) {
  const { repository } = deps;

  function asTaken(error: unknown): never {
    if (repository.isUniqueViolation(error)) {
      throw new GroupApplicationError(
        "NAME_TAKEN",
        "Группа с таким названием уже существует.",
      );
    }
    throw error;
  }

  return {
    async create(command: {
      name: string;
      description: string | null;
      actor: GroupActor;
      audit: GroupAuditContext;
    }): Promise<GroupRecord> {
      if (!command.name) {
        throw new GroupApplicationError(
          "VALIDATION_FAILED",
          "Название группы обязательно.",
        );
      }
      try {
        return await repository.transact(async (tx) => {
          const group = await tx.createGroup(command.name, command.description);
          await tx.recordEffects({
            audit: buildAudit(command.actor, command.audit, "groups:create", group, {
              description: command.description,
            }),
          });
          return group;
        });
      } catch (error) {
        asTaken(error);
      }
    },

    async update(command: {
      id: string;
      name: string;
      description: string | null;
      actor: GroupActor;
      audit: GroupAuditContext;
    }): Promise<GroupRecord> {
      if (!command.name) {
        throw new GroupApplicationError(
          "VALIDATION_FAILED",
          "Название группы обязательно.",
        );
      }
      const current = await repository.findCard(command.id);
      if (!current) {
        throw new GroupApplicationError("NOT_FOUND", "Группа не найдена.");
      }
      try {
        return await repository.transact(async (tx) => {
          await tx.updateGroup(command.id, command.name, command.description);
          const next = { id: command.id, name: command.name };
          await tx.recordEffects({
            audit: buildAudit(command.actor, command.audit, "groups:update", next, {
              previousName: current.name,
              previousDescription: current.description,
              description: command.description,
            }),
          });
          return next;
        });
      } catch (error) {
        asTaken(error);
      }
    },

    async setMembers(command: {
      id: string;
      selectedUserIds: string[];
      actor: GroupActor;
      audit: GroupAuditContext;
    }): Promise<SetGroupMembersResult> {
      const context = await repository.findMembershipContext(command.id);
      if (!context) {
        throw new GroupApplicationError("NOT_FOUND", "Группа не найдена.");
      }

      const selected = [...new Set(command.selectedUserIds)];
      if (selected.length > 0) {
        const eligible = await repository.filterEligibleStudentIds(selected);
        if (eligible.length !== selected.length) {
          throw new GroupApplicationError(
            "INELIGIBLE_MEMBERS",
            "В группу можно добавлять только активных учеников.",
          );
        }
      }

      const previousUserIds = context.memberUserIds;
      const affectedUserIds = [...new Set([...previousUserIds, ...selected])];

      await repository.transact(async (tx) => {
        await tx.replaceMemberships(command.id, selected);
        await tx.recordEffects({
          audit: buildAudit(
            command.actor,
            command.audit,
            "groups:set_memberships",
            { id: context.id, name: context.name },
            { previousUserIds, nextUserIds: selected },
          ),
        });
      });

      return {
        previousUserIds,
        affectedUserIds,
        courseIds: context.courseIds,
        selectedCount: selected.length,
      };
    },
  };
}

export type { GroupMembershipContext };
