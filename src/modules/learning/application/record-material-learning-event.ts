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
    try {
      projection = await dependencies.repository.saveEventAndProject({
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
    } catch (error) {
      if (!(error instanceof MaterialLearningDomainError)) throw error;
      throw new LearningApplicationError(
        "INVALID_EVENT",
        error instanceof Error ? error.message : "Некорректное событие обучения.",
      );
    }

    return toMaterialLearningStateDto(projection);
  };
}
