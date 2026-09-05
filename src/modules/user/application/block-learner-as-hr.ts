import { STANDARD_ROLE_NAMES } from "@/lib/roles";
import { USER_STATUSES } from "@/lib/users";
import { BlockLearnerError } from "./block-learner-as-hr-errors";
import type { BlockLearnerRepository, LearnerToBlock } from "./block-learner-as-hr-ports";

// Блокировка ученика HR-ом. Политики (только ученик, не архив/не блок) и
// атомарная мутация (статус BLOCKED + отмена PENDING-активаций + аудит) — здесь.
// Guard прав, ревалидация путей и redirect'ы — в транспорте.

export function combineRoleNames(role: string, roleProfileNames: string[]): string[] {
  return [...new Set([...roleProfileNames, role].filter(Boolean))];
}

export type BlockLearnerActor = { id: string; login: string | null; name: string | null };
export type BlockLearnerAuditContext = { ipAddress: string | null; userAgent: string | null };

export type BlockLearnerCommand = {
  learnerId: string;
  source: string;
  actor: BlockLearnerActor;
  audit: BlockLearnerAuditContext;
};

export type BlockLearnerResult = {
  learner: { id: string; name: string; login: string };
  relatedCourseIds: string[];
};

export function createBlockLearnerAsHr(deps: { repository: BlockLearnerRepository }) {
  const { repository } = deps;

  return async function blockLearnerAsHr(
    command: BlockLearnerCommand,
  ): Promise<BlockLearnerResult> {
    const learner = await repository.findLearner(command.learnerId);
    if (!learner) {
      throw new BlockLearnerError("NOT_FOUND", null, "Ученик не найден.");
    }
    if (!combineRoleNames(learner.role, learner.roleProfileNames).includes(STANDARD_ROLE_NAMES.STUDENT)) {
      throw new BlockLearnerError("NOT_STUDENT", null, "HR может блокировать только учеников.");
    }
    if (learner.status === USER_STATUSES.ARCHIVED) {
      throw new BlockLearnerError(
        "ALREADY_ARCHIVED",
        learner.login,
        "Пользователь уже архивирован и недоступен для блокировки.",
      );
    }
    if (learner.status === USER_STATUSES.BLOCKED) {
      throw new BlockLearnerError("ALREADY_BLOCKED", learner.login, "Ученик уже находится в архиве HR.");
    }

    const relatedCourseIds = await repository.findRelatedCourseIds(learner.id);

    await repository.transact(async (tx) => {
      await tx.blockUser(learner.id);
      await tx.cancelPendingActivationInvites(learner.id);
      await tx.recordAudit(buildAudit(learner, command));
    });

    return {
      learner: { id: learner.id, name: learner.name, login: learner.login },
      relatedCourseIds,
    };
  };
}

function buildAudit(learner: LearnerToBlock, command: BlockLearnerCommand) {
  return {
    actorId: command.actor.id,
    actorLogin: command.actor.login,
    actorName: command.actor.name,
    action: "users:block",
    objectType: "user",
    objectId: learner.id,
    objectLabel: learner.name,
    ipAddress: command.audit.ipAddress,
    userAgent: command.audit.userAgent,
    metadata: {
      login: learner.login,
      email: learner.email,
      previousStatus: learner.status,
      nextStatus: USER_STATUSES.BLOCKED,
      source: command.source,
    },
  };
}
