import { CourseApplicationError } from "./errors";
import type { CourseAuditActor, CourseDetails, CourseSettingsRepository } from "./ports";
import { CourseProgressionError, planCourseProgression } from "../domain/progression-settings";

export function createManageCourseSettings(repository: CourseSettingsRepository) {
  return {
    updateDetails(command: { courseId: string; details: CourseDetails; actor: CourseAuditActor }) {
      return repository.transact(async (transaction) => {
        validateDetails(command.details);
        const previous = await transaction.loadDetails(command.courseId);
        if (!previous) throw new CourseApplicationError("COURSE_NOT_FOUND", "Курс не найден");
        const changedFields = changedCourseFields(previous, command.details);
        if (changedFields.length === 0) return { changed: false };

        await transaction.updateDetails(command.courseId, command.details);
        await transaction.markContentChanged(command.courseId);
        await transaction.recordAudit({
          actor: command.actor,
          action: "courses:update",
          courseId: command.courseId,
          courseTitle: command.details.title,
          metadata: { changedFields, previous, next: command.details },
        });
        return { changed: true };
      });
    },

    updateTitle(command: { courseId: string; title: string; actor: CourseAuditActor }) {
      return repository.transact(async (transaction) => {
        const title = command.title.trim();
        if (!title) throw new CourseApplicationError("INVALID_INPUT", "Название обязательно");
        const previous = await transaction.loadTitle(command.courseId);
        if (!previous) throw new CourseApplicationError("COURSE_NOT_FOUND", "Курс не найден");
        if (previous.title === title) return { changed: false };

        await transaction.updateTitle(command.courseId, title);
        await transaction.markContentChanged(command.courseId);
        await transaction.recordAudit({
          actor: command.actor,
          action: "courses:update-title",
          courseId: command.courseId,
          courseTitle: title,
          metadata: { previous: { title: previous.title }, next: { title } },
        });
        return { changed: true };
      });
    },

    updateProgression(command: {
      courseId: string;
      navigationMode: string;
      quizGateMode: string;
      completionMode: string;
      statusFormat: string;
      requestedRequiredItemIds: string[];
      requestedGradedItemIds: string[];
      actor: CourseAuditActor;
    }) {
      return repository.transact(async (transaction) => {
        const previous = await transaction.loadProgression(command.courseId);
        if (!previous) throw new CourseApplicationError("COURSE_NOT_FOUND", "Курс не найден");
        let plan;
        try {
          plan = planCourseProgression({ ...command, items: previous.items });
        } catch (error) {
          if (error instanceof CourseProgressionError) {
            throw new CourseApplicationError("INVALID_PROGRESSION", error.message);
          }
          throw error;
        }

        await transaction.updateProgression(command.courseId, plan);
        await transaction.markContentChanged(command.courseId);
        await transaction.recordAudit({
          actor: command.actor,
          action: "courses:update_progression_settings",
          courseId: command.courseId,
          courseTitle: previous.title,
          metadata: {
            previous: withoutItems(previous),
            next: {
              navigationMode: plan.navigationMode,
              quizGateMode: plan.quizGateMode,
              completionMode: plan.completionMode,
              statusFormat: plan.statusFormat,
              gradedItemIds: plan.gradedItemIds,
              requiredItemIds: plan.requiredItemIds,
            },
          },
        });
        return plan;
      });
    },
  };
}

function validateDetails(details: CourseDetails) {
  if (!details.title.trim()) throw new CourseApplicationError("INVALID_INPUT", "Название обязательно");
  if (!details.description?.trim()) throw new CourseApplicationError("INVALID_INPUT", "Описание обязательно");
  if (!new Set(["SCORE_ONLY", "SCORE_WITH_ANSWERS", "FULL_REVIEW"]).has(details.resultViewMode)) {
    throw new CourseApplicationError("INVALID_INPUT", "Неверный режим показа результата");
  }
}

function changedCourseFields(previous: CourseDetails, next: CourseDetails) {
  return Object.entries(next)
    .filter(([key, value]) => previous[key as keyof CourseDetails] !== value)
    .map(([field, value]) => ({
      field,
      previous: previous[field as keyof CourseDetails] ?? null,
      next: value ?? null,
    }));
}

function withoutItems<T extends { items: unknown }>(value: T): Omit<T, "items"> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "items"),
  ) as Omit<T, "items">;
}
