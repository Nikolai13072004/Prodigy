import type { CourseQuizGateMode } from "@/lib/constants";
import { getCourseProgress } from "@/lib/course-progress";
import { planSurveyAnswers } from "../domain/survey-answers";
import type { SurveyReportAnswer } from "../domain/survey-answers";
import type {
  SurveyAnswerWrite,
  SurveyAudit,
  SurveySubmissionRepository,
} from "./survey-submission-ports";

// Use-case: сдача course-опроса (survey на самом курсе, отдельно от структуры).

export type SubmitCourseSurveyActor = {
  id: string;
  login: string | null;
  name: string | null;
  displayName: string;
  email: string | null;
};

export type SubmitCourseSurveyAuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type SubmitCourseSurveyCommand = {
  courseId: string;
  actor: SubmitCourseSurveyActor;
  audit: SubmitCourseSurveyAuditContext;
  now: Date;
  getRawAnswer: (questionId: string) => string;
  parseQuestionOptionsJson: (optionsJson: string | null) => string[];
};

export type SubmitCourseSurveyOwnerRecipient = {
  email: string;
  name: string;
  firstName: string;
};

export type SubmitCourseSurveyReportPayload = {
  courseId: string;
  courseTitle: string;
  surveyTitle: string;
  learnerId: string;
  learnerName: string;
  learnerEmail: string | null;
  submittedAt: Date;
  answers: SurveyReportAnswer[];
};

export type SubmitCourseSurveyResult =
  | { status: "REDIRECT_HOME" }
  | { status: "COURSE_NOT_COMPLETED" }
  | { status: "ALREADY_SUBMITTED" }
  | { status: "MISSING_ANSWER"; questionTitle: string }
  | {
      status: "OK";
      reportRecipient: SubmitCourseSurveyOwnerRecipient | null;
      reportPayload: SubmitCourseSurveyReportPayload;
    };

export type SubmitCourseSurveyDeps = {
  repository: SurveySubmissionRepository;
};

export function createSubmitCourseSurvey(
  deps: SubmitCourseSurveyDeps,
) {
  const { repository } = deps;

  return async function submitCourseSurvey(
    command: SubmitCourseSurveyCommand,
  ): Promise<SubmitCourseSurveyResult> {
    const assigned = await repository.isUserAssignedToCourse(
      command.actor.id,
      command.courseId,
    );
    if (!assigned) return { status: "REDIRECT_HOME" };

    const [context, learner] = await Promise.all([
      repository.loadCourseSurveyContext(command.courseId, command.actor.id),
      repository.loadLearner(command.actor.id),
    ]);
    if (!context) return { status: "REDIRECT_HOME" };
    const surveyTemplate = context.surveyTemplate;
    if (!surveyTemplate || !surveyTemplate.isActive) {
      return { status: "REDIRECT_HOME" };
    }

    const progress = getCourseProgress({
      quizGateMode: (context.course.quizGateMode === "PASSED"
        ? "PASSED"
        : "RESOLVED") as CourseQuizGateMode,
      items: context.items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        isRequired: item.isRequired,
        viewed: item.type === "QUIZ" ? false : item.views.length > 0,
        materialProgress:
          item.type === "QUIZ" ? 0 : item.views[0]?.progressPercent ?? 0,
        quiz: item.quiz,
      })),
    });
    if (!progress.isCompleted) return { status: "COURSE_NOT_COMPLETED" };

    if (await repository.hasCourseResponse(command.courseId, command.actor.id)) {
      return { status: "ALREADY_SUBMITTED" };
    }

    const answerPlan = planSurveyAnswers(
      surveyTemplate.questions,
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
      const response = await tx.createCourseResponse({
        templateId: surveyTemplate.id,
        courseId: command.courseId,
        userId: command.actor.id,
      });
      await tx.createCourseAnswers(response.id, answers);

      const audit: SurveyAudit = {
        actorId: command.actor.id,
        actorLogin: command.actor.login,
        actorName: command.actor.name,
        action: "course_survey:submit",
        objectType: "course_survey_response",
        objectId: `${command.courseId}:${command.actor.id}`,
        objectLabel: context.course.title,
        ipAddress: command.audit.ipAddress,
        userAgent: command.audit.userAgent,
        metadata: {
          courseId: command.courseId,
          templateId: surveyTemplate.id,
          answersCount: answers.length,
          reportEmailQueued,
        },
      };
      await tx.recordEffects({ audit });
    });

    const owner = context.course.owner;
    const reportRecipient: SubmitCourseSurveyOwnerRecipient | null =
      owner && owner.email
        ? { email: owner.email, name: owner.name, firstName: owner.firstName }
        : null;

    return {
      status: "OK",
      reportRecipient,
      reportPayload: {
        courseId: command.courseId,
        courseTitle: context.course.title,
        surveyTitle: surveyTemplate.title,
        learnerId: command.actor.id,
        learnerName: learnerFullName,
        learnerEmail,
        submittedAt,
        answers: answerPlan.reportAnswers,
      },
    };
  };
}
