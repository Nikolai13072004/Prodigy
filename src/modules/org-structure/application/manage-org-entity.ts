import { OrgStructureApplicationError } from "./errors";
import type {
  OrgAudit,
  OrgEntityRecord,
  OrgEntityRepository,
} from "./ports";

// Дженерик-набор use-case для справочной сущности оргструктуры. Параметризуется
// «видом» (объект аудита + сообщения), поэтому Department и Organization
// используют один и тот же код.

export type OrgEntityKind = {
  objectType: string; // "department" / "organization"
  auditPrefix: string; // "departments" / "organizations"
  requiredMessage: string; // "Название подразделения обязательно"
  notFoundMessage: string; // "Подразделение не найдено"
  takenMessage: string; // "Подразделение с таким названием уже существует"
};

export type OrgActor = {
  id: string;
  login: string | null;
  name: string | null;
};

export type OrgAuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type ManageOrgEntityDeps = {
  repository: OrgEntityRepository;
  kind: OrgEntityKind;
};

export function createManageOrgEntity(deps: ManageOrgEntityDeps) {
  const { repository, kind } = deps;

  function buildAudit(
    actor: OrgActor,
    ctx: OrgAuditContext,
    action: string,
    record: OrgEntityRecord,
    metadata?: unknown,
  ): OrgAudit {
    return {
      actorId: actor.id,
      actorLogin: actor.login,
      actorName: actor.name,
      action: `${kind.auditPrefix}:${action}`,
      objectType: kind.objectType,
      objectId: record.id,
      objectLabel: record.name,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata,
    };
  }

  function asTaken(error: unknown): never {
    if (repository.isUniqueViolation(error)) {
      throw new OrgStructureApplicationError("NAME_TAKEN", kind.takenMessage);
    }
    throw error;
  }

  return {
    async create(command: {
      name: string;
      actor: OrgActor;
      audit: OrgAuditContext;
    }): Promise<OrgEntityRecord> {
      if (!command.name) {
        throw new OrgStructureApplicationError(
          "VALIDATION_FAILED",
          kind.requiredMessage,
        );
      }
      try {
        return await repository.transact(async (tx) => {
          const record = await tx.create(command.name);
          await tx.recordEffects({
            audit: buildAudit(command.actor, command.audit, "create", record),
          });
          return record;
        });
      } catch (error) {
        asTaken(error);
      }
    },

    async update(command: {
      id: string;
      name: string;
      actor: OrgActor;
      audit: OrgAuditContext;
    }): Promise<OrgEntityRecord> {
      if (!command.name) {
        throw new OrgStructureApplicationError(
          "VALIDATION_FAILED",
          kind.requiredMessage,
        );
      }
      const existing = await repository.findById(command.id);
      if (!existing) {
        throw new OrgStructureApplicationError(
          "NOT_FOUND",
          kind.notFoundMessage,
        );
      }
      try {
        return await repository.transact(async (tx) => {
          await tx.update(command.id, command.name);
          const next = { id: command.id, name: command.name };
          await tx.recordEffects({
            audit: buildAudit(command.actor, command.audit, "update", next, {
              previousName: existing.name,
            }),
          });
          return next;
        });
      } catch (error) {
        asTaken(error);
      }
    },

    async remove(command: {
      id: string;
      actor: OrgActor;
      audit: OrgAuditContext;
    }): Promise<OrgEntityRecord> {
      const existing = await repository.findById(command.id);
      if (!existing) {
        throw new OrgStructureApplicationError(
          "NOT_FOUND",
          kind.notFoundMessage,
        );
      }
      await repository.transact(async (tx) => {
        await tx.remove(command.id);
        await tx.recordEffects({
          audit: buildAudit(command.actor, command.audit, "delete", existing),
        });
      });
      return existing;
    },
  };
}
