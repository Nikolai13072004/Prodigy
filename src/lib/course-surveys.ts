export const COURSE_SURVEY_QUESTION_TYPES = ["RATING_5", "SINGLE_CHOICE", "TEXT"] as const;
export const DEFAULT_COURSE_SURVEY_TITLE = "Опрос после курса";

export type CourseSurveyQuestionType = (typeof COURSE_SURVEY_QUESTION_TYPES)[number];

export type CourseSurveyQuestionDraft = {
  id: string | null;
  title: string;
  type: CourseSurveyQuestionType;
  isRequired: boolean;
  options: string[];
};

export const COURSE_SURVEY_QUESTION_TYPE_LABELS: Record<CourseSurveyQuestionType, string> = {
  RATING_5: "Оценка 1-5",
  SINGLE_CHOICE: "Выбор одного ответа",
  TEXT: "Текстовый ответ",
};

const DEFAULT_SURVEY_QUESTION_SEED: Array<Omit<CourseSurveyQuestionDraft, "id">> = [
  {
    title: "Насколько понятным был учебный материал?",
    type: "RATING_5",
    isRequired: true,
    options: [],
  },
  {
    title: "Насколько полученные знания применимы в работе?",
    type: "RATING_5",
    isRequired: true,
    options: [],
  },
  {
    title: "Насколько легко было пройти итоговый тест?",
    type: "RATING_5",
    isRequired: true,
    options: [],
  },
  {
    title: "Что стоит улучшить в курсе?",
    type: "TEXT",
    isRequired: false,
    options: [],
  },
];

const DEFAULT_CHOICE_OPTIONS = ["Да", "Скорее да", "Скорее нет", "Нет"];
const LEGACY_DEFAULT_COURSE_SURVEY_TITLE = "Анкета после курса";

export function formatCourseSurveyTitle(value: string | null | undefined) {
  const title = value?.trim();
  if (!title || title === LEGACY_DEFAULT_COURSE_SURVEY_TITLE) return DEFAULT_COURSE_SURVEY_TITLE;
  return title;
}

export function getDefaultCourseSurveyQuestions(): CourseSurveyQuestionDraft[] {
  return DEFAULT_SURVEY_QUESTION_SEED.map((question) => ({
    id: null,
    ...question,
  }));
}

export function isCourseSurveyQuestionType(value: string): value is CourseSurveyQuestionType {
  return COURSE_SURVEY_QUESTION_TYPES.includes(value as CourseSurveyQuestionType);
}

export function parseCourseSurveyQuestionsJson(value: string): CourseSurveyQuestionDraft[] {
  const fallback = getDefaultCourseSurveyQuestions();

  if (!value.trim()) return fallback;

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return fallback;

    const normalized = parsed
      .map((item) => {
        const title = typeof item?.title === "string" ? item.title.trim() : "";
        const id = typeof item?.id === "string" && item.id.trim() ? item.id.trim() : null;
        const type = typeof item?.type === "string" && isCourseSurveyQuestionType(item.type) ? item.type : "TEXT";
        const isRequired = Boolean(item?.isRequired);
        const options =
          type === "SINGLE_CHOICE"
            ? normalizeCourseSurveyQuestionOptions(item?.options).slice(0, 20)
            : [];

        if (!title) return null;
        if (type === "SINGLE_CHOICE" && options.length < 2) return null;

        return {
          id,
          title: title.slice(0, 500),
          type,
          isRequired,
          options,
        } satisfies CourseSurveyQuestionDraft;
      })
      .filter((item): item is CourseSurveyQuestionDraft => Boolean(item));

    return normalized.length > 0 ? normalized.slice(0, 20) : [];
  } catch {
    return fallback;
  }
}

export function getCourseSurveyQuestionInputLabel(type: CourseSurveyQuestionType) {
  if (type === "RATING_5") return "Оценка по шкале 1-5";
  if (type === "SINGLE_CHOICE") return "Один вариант из списка";
  return "Свободный ответ";
}

export function getCourseSurveyQuestionDescription(type: CourseSurveyQuestionType) {
  if (type === "RATING_5") return "Ученик выбирает одну оценку от 1 до 5.";
  if (type === "SINGLE_CHOICE") return "Ученик выбирает один из заданных вариантов.";
  return "Ученик может оставить развернутый комментарий.";
}

export function formatCourseSurveyRequiredLabel(isRequired: boolean) {
  return isRequired ? "Обязательный" : "Необязательный";
}

export function getDefaultCourseSurveyChoiceOptions() {
  return [...DEFAULT_CHOICE_OPTIONS];
}

export function parseCourseSurveyQuestionOptionsJson(value: string | null | undefined) {
  if (!value?.trim()) return [];

  try {
    return normalizeCourseSurveyQuestionOptions(JSON.parse(value));
  } catch {
    return [];
  }
}

export function serializeCourseSurveyQuestionOptions(options: string[]) {
  const normalized = normalizeCourseSurveyQuestionOptions(options);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

function normalizeCourseSurveyQuestionOptions(value: unknown) {
  if (!Array.isArray(value)) return [];

  const options: string[] = [];
  for (const item of value) {
    const option = typeof item === "string" ? item.trim() : "";
    if (!option) continue;
    if (options.includes(option)) continue;
    options.push(option.slice(0, 300));
  }

  return options;
}
