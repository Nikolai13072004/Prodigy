import {
  projectMaterialLearningEvent,
  toMaterialLearningStateDto,
  MaterialLearningDomainError,
  type MaterialLearningEvent,
  type MaterialLearningStateDto,
} from "@/modules/learning/domain/material-learning";
import type { LearningAccessPolicy, LearningRepository } from "@/modules/learning/application/ports";

export type RecordMaterialLearningEventCommand = {
  actor: {
    id: string;
    roles: string[];
    permissions: string[];
  };
  materialId: string;
  event: MaterialLearningEvent;
};

export class LearningApplicationError extends Error {
  constructor(
    readonly code: "MATERIAL_NOT_FOUND" | "FORBIDDEN" | "INVALID_EVENT",
    message: string,
  ) {
    super(message);
    this.name = "LearningApplicationError";
  }
}

export function createRecordMaterialLearningEvent(dependencies: {
  repository: LearningRepository;
  accessPolicy: LearningAccessPolicy;
  // Необязательный хук: вызывается ПОСЛЕ транзакции сохранения прогресса, когда
  // обязательный материал впервые перешёл через 100% — точка выдачи сертификата (ADR-012).
  onCourseProgressAdvanced?: (args: { userId: string; courseId: string }) => Promise<void>;
}) {
  return async function recordMaterialLearningEvent(
    command: RecordMaterialLearningEventCommand,
  ): Promise<MaterialLearningStateDto> {
    const material = await dependencies.repository.findMaterial(command.materialId);
    if (!material || material.type === "QUIZ" || material.type === "SURVEY") {
      throw new LearningApplicationError("MATERIAL_NOT_FOUND", "Материал не найден.");
    }

    const allowed = await dependencies.accessPolicy.canRecord({
      actorId: command.actor.id,
      roles: command.actor.roles,
      permissions: command.actor.permissions,
      courseId: material.courseId,
    });
    if (!allowed) {
      throw new LearningApplicationError("FORBIDDEN", "Недостаточно прав для сохранения прогресса.");
    }

    let projection;
    let previousProgressPercent: number | null;
    try {
      const saved = await dependencies.repository.saveEventAndProject({
        material,
        userId: command.actor.id,
        event: command.event,
        project: (previous) => projectMaterialLearningEvent({
          material: {
            type: material.type,
            totalPages: material.type === "PDF" ? material.totalSlides ?? 1 : 1,
          },
          previous,
          event: command.event,
        }),
      });
      projection = saved.projection;
      previousProgressPercent = saved.previousProgressPercent;
    } catch (error) {
      if (!(error instanceof MaterialLearningDomainError)) throw error;
      throw new LearningApplicationError(
        "INVALID_EVENT",
        error instanceof Error ? error.message : "Некорректное событие обучения.",
      );
    }

    // Выдачу сертификата триггерим ТОЛЬКО при первом переходе обязательного
    // материала через 100% — иначе проверка гоняется на каждое событие страницы.
    // Хук после транзакции и в try/catch: провал выдачи не должен ронять прогресс.
    if (
      dependencies.onCourseProgressAdvanced &&
      material.isRequired &&
      projection.progressPercent >= 100 &&
      (previousProgressPercent ?? 0) < 100
    ) {
      try {
        await dependencies.onCourseProgressAdvanced({
          userId: command.actor.id,
          courseId: material.courseId,
        });
      } catch (error) {
        console.error("Не удалось обработать завершение курса после прогресса материала:", error);
      }
    }

    return toMaterialLearningStateDto(projection);
  };
}
