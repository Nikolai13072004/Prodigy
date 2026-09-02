import {
  isValidFeedbackRating,
  resolveFeedbackStatus,
} from "../domain/feedback-submission";
import { CourseFeedbackApplicationError } from "./course-feedback-errors";
import type {
  CourseFeedbackAudit,
  CourseFeedbackRepository,
} from "./course-feedback-ports";

// Use-case отзывов о курсе. Отправка гейтится завершением курса (100%),
// удаление/публикация — с аудитом в той же транзакции.

export type FeedbackActor = {
  id: string;
  login: string | null;
  name: string | null;
};

export type FeedbackAuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type SubmitFeedbackResult = {
  status: string;
};

export type ManageCourseFeedbackDeps = {
  repository: CourseFeedbackRepository;
};

function buildAudit(
  actor: FeedbackActor,
  ctx: FeedbackAuditContext,
  action: string,
  objectId: string,
  objectLabel: string,
  metadata: unknown,
): CourseFeedbackAudit {
  return {
    actorId: actor.id,
    actorLogin: actor.login,
    actorName: actor.name,
    action,
    objectType: "course_feedback",
    objectId,
    objectLabel,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata,
  };
}

export function createManageCourseFeedback(deps: ManageCourseFeedbackDeps) {
  const { repository } = deps;

  return {
    async submit(command: {
      courseId: string;
      userId: string;
      rating: number;
      comment: string | null;
      moderationEnabled: boolean;
    }): Promise<SubmitFeedbackResult> {
      const percent = await repository.getCompletionPercent(
        command.courseId,
        command.userId,
      );
      if (percent === null) {
        throw new CourseFeedbackApplicationError(
          "COURSE_NOT_FOUND",
          "Курс не найден.",
        );
      }
      if (percent < 100) {
        throw new CourseFeedbackApplicationError(
          "NOT_COMPLETE",
          "Оставить отзыв можно только после завершения курса.",
        );
      }
      if (!isValidFeedbackRating(command.rating)) {
        throw new CourseFeedbackApplicationError(
          "VALIDATION_FAILED",
          "Оценка должна быть от 1 до 5",
        );
      }

      const status = resolveFeedbackStatus(command.moderationEnabled);
      await repository.transact((tx) =>
        tx.upsertFeedback({
          courseId: command.courseId,
          userId: command.userId,
          rating: command.rating,
          status,
          comment: command.comment,
        }),
      );
      return { status };
    },

    async deleteMine(command: {
      courseId: string;
      userId: string;
      actor: FeedbackActor;
      audit: FeedbackAuditContext;
    }): Promise<void> {
      const feedback = await repository.findMyFeedback(
        command.courseId,
        command.userId,
      );
      if (!feedback) {
        throw new CourseFeedbackApplicationError(
          "FEEDBACK_NOT_FOUND",
          "Отзыв не найден.",
        );
      }
      await repository.transact(async (tx) => {
        await tx.deleteFeedback(feedback.id);
        await tx.recordEffects({
          audit: buildAudit(
            command.actor,
            command.audit,
            "course_feedback:delete",
            feedback.id,
            feedback.courseTitle,
            {
              courseId: command.courseId,
              rating: feedback.rating,
              comment: feedback.comment,
            },
          ),
        });
      });
    },

    async publish(command: {
      courseId: string;
      feedbackId: string;
      actor: FeedbackActor;
      audit: FeedbackAuditContext;
    }): Promise<void> {
      const feedback = await repository.findModeration(
        command.courseId,
        command.feedbackId,
      );
      if (!feedback) {
        throw new CourseFeedbackApplicationError(
          "FEEDBACK_NOT_FOUND",
          "Отзыв не найден.",
        );
      }
      if (feedback.status === "PUBLISHED") {
        throw new CourseFeedbackApplicationError(
          "ALREADY_PUBLISHED",
          "Отзыв уже опубликован.",
        );
      }
      await repository.transact(async (tx) => {
        await tx.publishFeedback(feedback.id);
        await tx.recordEffects({
          audit: buildAudit(
            command.actor,
            command.audit,
            "course_feedback:publish",
            feedback.id,
            feedback.courseTitle,
            {
              courseId: feedback.courseId,
              learnerId: feedback.learnerId,
              learnerLogin: feedback.learnerLogin,
              learnerName: feedback.learnerName,
            },
          ),
        });
      });
    },
  };
}
