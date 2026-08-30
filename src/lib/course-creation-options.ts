export const COURSE_CREATION_MODE_OPTIONS = [
  {
    value: "presentation",
    label: "Загрузить презентацию",
    description: "Самый быстрый путь: файл, курс и тест.",
  },
  {
    value: "blank",
    label: "Пустой курс",
    description: "Структура собирается вручную после создания.",
  },
  {
    value: "template",
    label: "По шаблону",
    description: "Готовый каркас модулей и типовых уроков.",
  },
  {
    value: "copy",
    label: "Скопировать",
    description: "Новый черновик на основе существующего курса.",
  },
] as const;

export type CourseCreationMode = (typeof COURSE_CREATION_MODE_OPTIONS)[number]["value"];

export function getCourseCreationMode(value: string | null | undefined): CourseCreationMode {
  return COURSE_CREATION_MODE_OPTIONS.some((option) => option.value === value)
    ? (value as CourseCreationMode)
    : "presentation";
}

export const COURSE_TEMPLATE_OPTIONS = [
  {
    value: "presentation_with_quiz",
    label: "Презентация + тест",
    description: "Модуль с презентацией и итоговой проверкой знаний.",
  },
  {
    value: "three_step",
    label: "Три модуля",
    description: "Введение, основная часть и закрепление.",
  },
  {
    value: "required_training",
    label: "Обязательное обучение",
    description: "Материалы, контроль и финальный тест.",
  },
] as const;

export type CourseTemplateKey = (typeof COURSE_TEMPLATE_OPTIONS)[number]["value"];

export function isCourseTemplateKey(value: string): value is CourseTemplateKey {
  return COURSE_TEMPLATE_OPTIONS.some((option) => option.value === value);
}

export function getCourseTemplateLabel(value: CourseTemplateKey) {
  return COURSE_TEMPLATE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
