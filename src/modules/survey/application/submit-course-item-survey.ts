import { buildCourseOutline } from "@/lib/course-navigation";
import type {
  CourseNavigationMode,
  CourseQuizGateMode,
} from "@/lib/constants";
import { planSurveyAnswers } from "../domain/survey-answers";
import type {
  LearnerHead,
  SurveyAnswerWrite,
  SurveyAudit,
  SurveySubmissionRepository,
} from "./survey-submission-ports";
import type { SurveyReportAnswer } from "../domain/survey-answers";

// Use-case: сдача item-опроса учеником. Возвращает результат-статус
// вместо исключений — транспорт по нему выбирает redirect. Транзакция
// пишет response + answers + view + аудит одним куском.

export type SubmitCourseItemSurveyActor = {
  id: string;
  login: string | null;
  name: string | null;
  displayName: string; // готовое имя для reports/audit
  email: string | null;
};

export type SubmitCourseItemSurveyAuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type SubmitCourseItemSurveyCommand = {
  courseId: string;
  itemId: string;
  actor: SubmitCourseItemSurveyActor;
  audit: SubmitCourseItemSurveyAuditContext;
  now: Date;
  // Транспорт достаёт значения полей формы question:<id>: use-case не знает
  // о FormData, только о функции-ридере.
  getRawAnswer: (questionId: string) => string;
  // Инжектируется парсер optionsJson (из @/lib/course-surveys), чтобы модуль
  // не тянул lib в тестах.
  parseQuestionOptionsJson: (optionsJson: string | null) => string[];
};

export type SubmitCourseItemSurveyOwnerRecipient = {
  email: string;
  name: string;
  firstName: string;
};

export type SubmitCourseItemSurveyReportPayload = {
  courseId: string;
  courseTitle: string;
  surveyTitle: string;
  learnerId: string;
  learnerName: string;
  learnerEmail: string | null;
  submittedAt: Date;
  answers: SurveyReportAnswer[];
};

export type SubmitCourseItemSurveyResult =
  | { status: "REDIRECT_HOME" } // not eligible: no course / not published / item not survey / template inactive
  | { status: "LOCKED"; message?: string }
  | { status: "ALREADY_SUBMITTED" }
  | { status: "MISSING_ANSWER"; questionTitle: string }
  | {
      status: "OK";
      surveyItem: { id: string; title: string };
      reportRecipient: SubmitCourseItemSurveyOwnerRecipient | null;
      reportPayload: SubmitCourseItemSurveyReportPayload;
    };

export type SubmitCourseItemSurveyDeps = {
  repository: SurveySubmissionRepository;
};

export function createSubmitCourseItemSurvey(
  deps: SubmitCourseItemSurveyDeps,
) {
  const { repository } = deps;

  return async function submitCourseItemSurvey(
    command: SubmitCourseItemSurveyCommand,
  ): Promise<SubmitCourseItemSurveyResult> {
    const assigned = await repository.isUserAssignedToCourse(
      command.actor.id,
      command.courseId,
    );
    if (!assigned) return { status: "REDIRECT_HOME" };

    const [context, learner] = await Promise.all([
      repository.loadItemSurveyContext(
        command.courseId,
        command.itemId,
        command.actor.id,
      ),
      repository.loadLearner(command.actor.id),
    ]);
    if (!context) return { status: "REDIRECT_HOME" };
    if (context.course.status !== "PUBLISHED") return { status: "REDIRECT_HOME" };

    const surveyItem = context.surveyItem;
    if (!surveyItem || !surveyItem.templateIsActive) {
      return { status: "REDIRECT_HOME" };
    }

    const outline = buildCourseOutline(
      context.items.map((item) => ({
        ...item,
        quiz: item.quiz ? { ...item.quiz, attempts: item.quiz.attempts } : null,
      })),
      (context.course.navigationMode === "SEQUENTIAL"
        ? "SEQUENTIAL"
        : "FREE") as CourseNavigationMode,
      {
        lockQuizzesUntilPreviousRequiredComplete: true,
        lockMaterialsWhenQuizStarted: true,
        quizGateMode: (context.course.quizGateMode === "PASSED"
          ? "PASSED"
          : "RESOLVED") as CourseQuizGateMode,
      },
    );
    const outlineEntry = outline.find((entry) => entry.id === command.itemId) ?? null;
    if (outlineEntry?.isLocked) return { status: "LOCKED" };

    if (await repository.hasItemResponse(command.itemId, command.actor.id)) {
      return { status: "ALREADY_SUBMITTED" };
    }

    const answerPlan = planSurveyAnswers(
      surveyItem.questions,
      command.getRawAnswer,
      command.parseQuestionOptionsJson,
    );
    if (!answerPlan.ok) {
      return {
        status: "MISSING_ANSWER",
        questionTitle: answerPlan.missingQuestionTitle,
      };
    }

    const answers: SurveyAnswerWrite[] = answerPlan.answers;
    const submittedAt = command.now;
    const reportEmailQueued = Boolean(context.course.owner?.email);
    const learnerFullName =
      learner?.name ?? command.actor.displayName ?? command.actor.email ?? "Ученик";
    const learnerEmail = learner?.email ?? null;

    await repository.transact(async (tx) => {
      const response = await tx.createItemResponse({
        templateId: surveyItem.templateId,
        courseId: command.courseId,
        courseItemId: command.itemId,
        userId: command.actor.id,
      });
      await tx.createItemAnswers(response.id, answers);
      await tx.upsertItemView({
        courseItemId: command.itemId,
        userId: command.actor.id,
        viewedAt: submittedAt,
      });

      const audit: SurveyAudit = {
        actorId: command.actor.id,
        actorLogin: command.actor.login,
        actorName: command.actor.name,
        action: "course_item_survey:submit",
        objectType: "course_item_survey_response",
        objectId: `${command.itemId}:${command.actor.id}`,
        objectLabel: surveyItem.title,
        ipAddress: command.audit.ipAddress,
        userAgent: command.audit.userAgent,
        metadata: {
          courseId: command.courseId,
          courseItemId: command.itemId,
          templateId: surveyItem.templateId,
          answersCount: answers.length,
          reportEmailQueued,
        },
      };
      await tx.recordEffects({ audit });
    });

    // Owner тип из порта: { name; email; firstName } — narrow'им к
    // «with email» для писем; if-else гарантирует non-null email.
    const owner = context.course.owner;
    const reportRecipient: SubmitCourseItemSurveyOwnerRecipient | null =
      owner && owner.email
        ? { email: owner.email, name: owner.name, firstName: owner.firstName }
        : null;

    return {
      status: "OK",
      surveyItem: { id: surveyItem.id, title: surveyItem.title },
      reportRecipient,
      reportPayload: {
        courseId: command.courseId,
        courseTitle: context.course.title,
        surveyTitle: surveyItem.templateTitle,
        learnerId: command.actor.id,
        learnerName: learnerFullName,
        learnerEmail,
        submittedAt,
        answers: answerPlan.reportAnswers,
      },
    };
  };
}

// Утилита учиться-от-learner-head: transport вправе взять пред-загруженного
// пользователя, если он у него уже есть. По умолчанию transport передаёт
// имя из session; use-case выберет между learner из порта и actor.displayName.
export function pickLearnerName(
  learner: LearnerHead | null,
  fallback: string,
) {
  return learner?.name ?? fallback;
}
