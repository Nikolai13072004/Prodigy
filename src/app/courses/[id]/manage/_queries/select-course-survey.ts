import {
  getDefaultCourseSurveyQuestions,
  parseCourseSurveyQuestionOptionsJson,
} from "@/lib/course-surveys";

type SurveyTemplate = {
  questions: Array<{
    id: string;
    title: string;
    type: string;
    optionsJson: string | null;
    isRequired: boolean;
  }>;
  responses: Array<{
    answers: Array<{
      questionId: string;
      ratingValue: number | null;
    }>;
  }>;
};

export function selectCourseSurveyViewModel(template: SurveyTemplate | null) {
  const questionDrafts = template?.questions.length
    ? template.questions.map((question) => ({
        id: question.id,
        title: question.title,
        type: (question.type === "RATING_5" || question.type === "SINGLE_CHOICE"
          ? question.type
          : "TEXT") as "RATING_5" | "SINGLE_CHOICE" | "TEXT",
        isRequired: question.isRequired,
        options: parseCourseSurveyQuestionOptionsJson(question.optionsJson),
      }))
    : getDefaultCourseSurveyQuestions();

  const ratingQuestions = (template?.questions ?? [])
    .filter((question) => question.type === "RATING_5")
    .map((question) => {
      const values = (template?.responses ?? []).flatMap((response) =>
        response.answers
          .filter((answer) => answer.questionId === question.id && answer.ratingValue !== null)
          .map((answer) => answer.ratingValue as number)
      );
      return {
        id: question.id,
        title: question.title,
        average: values.length
          ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
          : null,
        responseCount: values.length,
      };
    });

  return {
    questionDrafts,
    ratingQuestions,
    responseCount: template?.responses.length ?? 0,
    requiredQuestionCount: template?.questions.filter((question) => question.isRequired).length ?? 0,
  };
}

export type CourseSurveyViewModel = ReturnType<typeof selectCourseSurveyViewModel>;
