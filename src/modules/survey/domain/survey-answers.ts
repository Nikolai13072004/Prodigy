import type { CourseSurveyQuestionType } from "@/lib/course-surveys";
import { isValidFeedbackRating } from "@/modules/course/domain/feedback-submission";

// Чистое планирование ответов опроса из сырых значений формы.
// Одна логика для курсового и item-опроса (раньше была продублирована в двух action-функциях),
// правило рейтинга 1–5 переиспользует isValidFeedbackRating (раньше — третья копия правила).

export type SurveyQuestionInput = {
  id: string;
  type: string;
  title: string;
  isRequired: boolean;
  optionsJson: string | null;
};

export type SurveyAnswerPlan = {
  questionId: string;
  ratingValue: number | null;
  textValue: string | null;
};

export type SurveyReportAnswer = {
  questionTitle: string;
  questionType: CourseSurveyQuestionType;
  answerText: string | null;
};

export type PlanSurveyAnswersResult =
  | { ok: true; answers: SurveyAnswerPlan[]; reportAnswers: SurveyReportAnswer[] }
  | { ok: false; missingQuestionTitle: string };

export function normalizeSurveyQuestionType(value: string): CourseSurveyQuestionType {
  if (value === "RATING_5" || value === "SINGLE_CHOICE") return value;
  return "TEXT";
}

// rawValue(questionId) — сырое (уже trimmed) значение поля `question:<id>` из формы.
// parseOptions — парсер optionsJson в список допустимых вариантов (@/lib/course-surveys).
// Возвращает решение, а не бросает: транспорт сам формирует ошибку/редирект по missingQuestionTitle.
export function planSurveyAnswers(
  questions: SurveyQuestionInput[],
  rawValue: (questionId: string) => string,
  parseOptions: (optionsJson: string | null) => string[],
): PlanSurveyAnswersResult {
  const answers: SurveyAnswerPlan[] = [];

  for (const question of questions) {
    if (question.type === "RATING_5") {
      const raw = Number.parseInt(rawValue(question.id), 10);
      const ratingValue = isValidFeedbackRating(raw) ? raw : null;
      if (question.isRequired && ratingValue === null) {
        return { ok: false, missingQuestionTitle: question.title };
      }
      answers.push({ questionId: question.id, ratingValue, textValue: null });
      continue;
    }

    if (question.type === "SINGLE_CHOICE") {
      const options = parseOptions(question.optionsJson);
      const value = rawValue(question.id) || null;
      const selectedOption = value && options.includes(value) ? value : null;
      if (question.isRequired && !selectedOption) {
        return { ok: false, missingQuestionTitle: question.title };
      }
      answers.push({ questionId: question.id, ratingValue: null, textValue: selectedOption });
      continue;
    }

    const value = rawValue(question.id) || null;
    if (question.isRequired && !value) {
      return { ok: false, missingQuestionTitle: question.title };
    }
    answers.push({ questionId: question.id, ratingValue: null, textValue: value });
  }

  const answerByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));
  const reportAnswers: SurveyReportAnswer[] = questions.map((question) => {
    const answer = answerByQuestionId.get(question.id);
    return {
      questionTitle: question.title,
      questionType: normalizeSurveyQuestionType(question.type),
      answerText:
        typeof answer?.ratingValue === "number"
          ? String(answer.ratingValue)
          : answer?.textValue ?? null,
    };
  });

  return { ok: true, answers, reportAnswers };
}
