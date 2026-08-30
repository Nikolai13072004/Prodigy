"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManageCourse } from "@/lib/auth-guards";
import { COURSE_ITEM_TYPES, type CourseItemType } from "@/lib/constants";
import { formatCourseSurveyTitle, getDefaultCourseSurveyQuestions, serializeCourseSurveyQuestionOptions } from "@/lib/course-surveys";
import { hasMeaningfulRichText, sanitizeRichTextHtml } from "@/lib/rich-text";
import { ContentApplicationError } from "@/modules/content/application/errors";
import type { CourseContentItemType } from "@/modules/content/application/ports";
import { manageCourseContent } from "@/modules/content/server/manage-course-content";
import { asOptionalPositiveInt, asOptionalString, asPositiveInt, asString, parseOptionalCourseCoverUpdate, parseOptionalCourseThumbnailUpdate, parsePresentationViewMode } from "./course-action-input";

function asOptionalModuleId(formData: FormData, key = "moduleId") {
  const value = asString(formData, key);
  return value || null;
}

function assertCourseItemType(type: string): CourseItemType {
  if (COURSE_ITEM_TYPES.includes(type as CourseItemType)) return type as CourseItemType;
  throw new Error("Выберите корректный тип материала");
}

export async function createCourseModule(courseId: string, formData: FormData) {
  await requireManageCourse(courseId);

  const title = asString(formData, "title");
  const description = asOptionalString(formData, "description");
  try {
    await manageCourseContent.createModule({ courseId, title, description });
  } catch (error) {
    redirectCourseStructureError(
      courseId,
      error instanceof Error ? error.message : "Не удалось добавить раздел",
    );
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/manage`);
  redirect(manageCourseUrl(courseId, { section: "structure", structureSaved: "Раздел добавлен" }));
}

export async function updateCourseModule(courseId: string, moduleId: string, formData: FormData) {
  await requireManageCourse(courseId);

  const title = asString(formData, "title");
  const description = asOptionalString(formData, "description");
  try {
    await manageCourseContent.updateModule({ courseId, moduleId, title, description });
  } catch (error) {
    redirectCourseStructureError(
      courseId,
      error instanceof Error ? error.message : "Не удалось сохранить раздел",
    );
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/manage`);
  redirect(manageCourseUrl(courseId, { section: "structure", structureSaved: "Раздел сохранен" }));
}

export async function deleteCourseModule(courseId: string, moduleId: string) {
  await requireManageCourse(courseId);

  try {
    await manageCourseContent.deleteModule({ courseId, moduleId });
  } catch (error) {
    redirectCourseStructureError(
      courseId,
      error instanceof Error ? error.message : "Не удалось удалить раздел",
    );
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/manage`);
  redirect(manageCourseUrl(courseId, { section: "structure", structureSaved: "Раздел удален" }));
}

export async function createCourseItem(courseId: string, formData: FormData) {
  await requireManageCourse(courseId);

  const rawType = asString(formData, "type");
  let type: CourseItemType;
  try {
    type = assertCourseItemType(rawType);
  } catch (error) {
    redirectCourseStructureError(courseId, error instanceof Error ? error.message : "Выберите корректный тип материала");
    return;
  }
  const moduleId = asOptionalModuleId(formData);
  const title = asString(formData, "title");
  const rawContent = asOptionalString(formData, "content");
  const fileUrl = asOptionalString(formData, "fileUrl");
  const totalSlides = asOptionalPositiveInt(formData, "totalSlides");
  const presentationViewMode = parsePresentationViewMode(formData);
  const maxAttempts = asPositiveInt(formData, "maxAttempts", 1);
  const minCorrectAnswers = asPositiveInt(formData, "minCorrectAnswers", 1);
  const isRequired = asString(formData, "isRequired") !== "0";
  let courseCoverUrl: string | null | undefined;
  let courseThumbnailUrl: string | null | undefined;
  try {
    courseCoverUrl = parseOptionalCourseCoverUpdate(formData);
  } catch (error) {
    redirectCourseStructureError(
      courseId,
      error instanceof Error ? error.message : "Проверьте обложку курса"
    );
  }
  try {
    courseThumbnailUrl = parseOptionalCourseThumbnailUpdate(formData);
  } catch (error) {
    redirectCourseStructureError(
      courseId,
      error instanceof Error ? error.message : "Проверьте миниатюру курса"
    );
  }

  const content = type === "TEXT" ? sanitizeRichTextHtml(rawContent) : rawContent;

  if (!title) redirectCourseStructureError(courseId, "Название материала обязательно");
  if (type === "TEXT" && !hasMeaningfulRichText(content)) {
    redirectCourseStructureError(courseId, "Для страницы заполните содержание или выберите другой тип материала");
  }

  if ((type === "VIDEO" || type === "PDF") && !fileUrl) {
    redirectCourseStructureError(courseId, "Для видео и презентации нужна ссылка или загруженный файл");
  }

  if (type === "PDF" && (!totalSlides || totalSlides < 1)) {
    redirectCourseStructureError(courseId, "Загрузите PDF/PPTX, чтобы система определила количество слайдов");
  }

  let createdItem: { id: string };
  try {
    createdItem = await manageCourseContent.createItem({
      courseId,
      moduleId,
      type: type as CourseContentItemType,
      title,
      content: type === "TEXT" ? content : null,
      contentIsMeaningful: hasMeaningfulRichText(content),
      fileUrl: type === "VIDEO" || type === "PDF" ? fileUrl : null,
      totalSlides: type === "PDF" ? totalSlides : null,
      presentationViewMode: type === "PDF" ? presentationViewMode : "PDF_PREVIEW",
      isRequired,
      maxAttempts,
      minCorrectAnswers,
      coverUrl: courseCoverUrl,
      thumbnailUrl: courseThumbnailUrl,
      survey: type === "SURVEY"
        ? {
            title: formatCourseSurveyTitle(title),
            description: "Поделитесь впечатлением о курсе и качестве учебных материалов.",
            isActive: true,
            isRequired,
            questions: getDefaultCourseSurveyQuestions().map((question, index) => ({
              title: question.title,
              type: question.type,
              optionsJson: serializeCourseSurveyQuestionOptions(question.options),
              isRequired: question.isRequired,
              orderIndex: index,
            })),
          }
        : null,
    });
  } catch (error) {
    redirectCourseStructureError(
      courseId,
      error instanceof Error ? error.message : "Не удалось добавить материал",
    );
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/manage`);
  if (type === "SURVEY") {
    const params = new URLSearchParams({ surveySaved: "Опрос добавлен" });
    redirect(`/courses/${courseId}/survey/${createdItem.id}/builder?${params.toString()}`);
  }
  redirect(manageCourseUrl(courseId, { section: "structure", structureSaved: "Материал добавлен" }));
}

export async function createMaterialItem(courseId: string, formData: FormData) {
  const nextFormData = new FormData();
  for (const [key, value] of formData.entries()) {
    nextFormData.append(key, value);
  }
  const type = asString(formData, "type");
  if (type !== "VIDEO" && type !== "PDF") {
    redirectCourseStructureError(courseId, "Разрешены только презентация (PDF/PPTX) и видеоматериалы");
  }
  await createCourseItem(courseId, nextFormData);
}

export async function createQuizItem(courseId: string, formData: FormData) {
  const nextFormData = new FormData();
  for (const [key, value] of formData.entries()) {
    nextFormData.append(key, value);
  }
  nextFormData.set("type", "QUIZ");
  await createCourseItem(courseId, nextFormData);
}

export async function updateCourseItem(courseId: string, itemId: string, formData: FormData) {
  await requireManageCourse(courseId);

  const title = asString(formData, "title");
  const moduleId = asOptionalModuleId(formData);
  const rawContent = asOptionalString(formData, "content");
  const fileUrl = asOptionalString(formData, "fileUrl");
  const totalSlides = asOptionalPositiveInt(formData, "totalSlides");
  const presentationViewMode = parsePresentationViewMode(formData);
  const isRequired = asString(formData, "isRequired") !== "0";
  let courseCoverUrl: string | null | undefined;
  let courseThumbnailUrl: string | null | undefined;
  try {
    courseCoverUrl = parseOptionalCourseCoverUpdate(formData);
  } catch (error) {
    redirectCourseStructureError(
      courseId,
      error instanceof Error ? error.message : "Проверьте обложку курса"
    );
  }
  try {
    courseThumbnailUrl = parseOptionalCourseThumbnailUpdate(formData);
  } catch (error) {
    redirectCourseStructureError(
      courseId,
      error instanceof Error ? error.message : "Проверьте миниатюру курса"
    );
  }

  const content = sanitizeRichTextHtml(rawContent);
  if (!title) redirectCourseStructureError(courseId, "Название элемента обязательно");
  try {
    await manageCourseContent.updateItem({
      courseId,
      itemId,
      moduleId,
      title,
      content,
      contentIsMeaningful: hasMeaningfulRichText(content),
      fileUrl,
      totalSlides,
      presentationViewMode,
      isRequired,
      coverUrl: courseCoverUrl,
      thumbnailUrl: courseThumbnailUrl,
    });
  } catch (error) {
    redirectCourseStructureError(
      courseId,
      error instanceof Error ? error.message : "Не удалось сохранить материал",
    );
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/manage`);
  redirect(manageCourseUrl(courseId, { section: "structure", structureSaved: "Материал сохранен" }));
}

export async function moveCourseItem(courseId: string, itemId: string, direction: "up" | "down") {
  await requireManageCourse(courseId);

  if (direction !== "up" && direction !== "down") {
    redirectCourseStructureError(courseId, "Некорректное направление перемещения");
  }
  try {
    await manageCourseContent.moveItem({ courseId, itemId, direction });
  } catch (error) {
    if (error instanceof ContentApplicationError && error.code === "NO_MOVE") {
      redirect(manageCourseUrl(courseId, { section: "structure" }));
    }
    redirectCourseStructureError(
      courseId,
      error instanceof Error ? error.message : "Не удалось изменить порядок материалов",
    );
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/manage`);
  redirect(manageCourseUrl(courseId, { section: "structure", structureSaved: "Порядок материалов обновлен" }));
}

export async function updateQuizSettings(courseId: string, quizId: string, formData: FormData) {
  await requireManageCourse(courseId);
  const maxAttempts = asPositiveInt(formData, "maxAttempts", 1);
  const minCorrectAnswers = asPositiveInt(formData, "minCorrectAnswers", 1);
  const timeLimitMinutes = asOptionalPositiveInt(formData, "timeLimitMinutes");
  const shuffleQuestions = formData.get("shuffleQuestions") === "1";
  const shuffleAnswers = formData.get("shuffleAnswers") === "1";
  const lockMaterialsOnStart = formData.get("lockMaterialsOnStart") === "1";

  await manageCourseContent.updateQuizSettings({
    courseId,
    quizId,
    maxAttempts,
    minCorrectAnswers,
    timeLimitMinutes,
    shuffleQuestions,
    shuffleAnswers,
    lockMaterialsOnStart,
  });

  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/manage`);
  redirect(manageCourseUrl(courseId, { section: "structure", structureSaved: "Настройки теста сохранены" }));
}

export async function deleteCourseItem(courseId: string, itemId: string) {
  await requireManageCourse(courseId);
  try {
    await manageCourseContent.deleteItem({ courseId, itemId });
  } catch (error) {
    redirectCourseStructureError(
      courseId,
      error instanceof Error ? error.message : "Не удалось удалить материал",
    );
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/manage`);
}

export async function createQuestionSingleChoice(
  quizId: string,
  courseId: string,
  formData: FormData
) {
  await requireManageCourse(courseId);

  const prompt = asString(formData, "prompt");
  const options = asString(formData, "options")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const correctIndex = asPositiveInt(formData, "correctIndex", 1) - 1;
  const points = asPositiveInt(formData, "points", 1);

  if (!prompt) redirectCourseStructureError(courseId, "Введите текст вопроса");
  if (options.length < 2) redirectCourseStructureError(courseId, "Нужно минимум два варианта ответа");
  if (correctIndex < 0 || correctIndex >= options.length) {
    redirectCourseStructureError(courseId, "Номер правильного варианта вне диапазона");
  }

  await manageCourseContent.createQuestion({
    courseId,
    quizId,
    type: "SINGLE_CHOICE",
    prompt,
    config: JSON.stringify({ options, correctIndex }),
    points,
  });

  revalidatePath(`/courses/${courseId}/manage`);
  redirect(manageCourseUrl(courseId, { section: "structure", structureSaved: "Вопрос добавлен" }));
}

export async function createQuestionOpen(
  quizId: string,
  courseId: string,
  formData: FormData
) {
  await requireManageCourse(courseId);

  const prompt = asString(formData, "prompt");
  const sampleAnswer = asString(formData, "sampleAnswer");
  const points = asPositiveInt(formData, "points", 1);

  if (!prompt) redirectCourseStructureError(courseId, "Введите текст вопроса");
  if (!sampleAnswer) redirectCourseStructureError(courseId, "Для открытого ответа нужен эталон");

  await manageCourseContent.createQuestion({
    courseId,
    quizId,
    type: "OPEN",
    prompt,
    config: JSON.stringify({ sampleAnswer }),
    points,
  });

  revalidatePath(`/courses/${courseId}/manage`);
  redirect(manageCourseUrl(courseId, { section: "structure", structureSaved: "Вопрос добавлен" }));
}

export async function createQuestionMatching(
  quizId: string,
  courseId: string,
  formData: FormData
) {
  await requireManageCourse(courseId);

  const prompt = asString(formData, "prompt");
  const left = asString(formData, "left")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const right = asString(formData, "right")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const pairsRaw = asString(formData, "pairs");
  const points = asPositiveInt(formData, "points", 1);

  if (!prompt) redirectCourseStructureError(courseId, "Введите текст вопроса");
  if (left.length < 2 || right.length < 2) {
    redirectCourseStructureError(courseId, "Для соответствия нужно минимум по 2 значения слева и справа");
  }

  const correctPairs = new Array(left.length).fill(-1);
  for (const part of pairsRaw.split(/[,;]/).map((value) => value.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)\s*[:=]\s*(\d+)$/);
    if (!match) redirectCourseStructureError(courseId, `Неверная пара ${part}. Используйте формат 1:2`);
    const leftIndex = parseInt(match[1], 10) - 1;
    const rightIndex = parseInt(match[2], 10) - 1;
    if (leftIndex < 0 || leftIndex >= left.length || rightIndex < 0 || rightIndex >= right.length) {
      redirectCourseStructureError(courseId, `Пара ${part} указывает на элементы вне диапазона`);
    }
    correctPairs[leftIndex] = rightIndex;
  }

  if (correctPairs.some((value) => value < 0)) {
    redirectCourseStructureError(courseId, "Нужно указать соответствие для каждого значения слева");
  }

  await manageCourseContent.createQuestion({
    courseId,
    quizId,
    type: "MATCHING",
    prompt,
    config: JSON.stringify({ left, right, correctPairs }),
    points,
  });

  revalidatePath(`/courses/${courseId}/manage`);
  redirect(manageCourseUrl(courseId, { section: "structure", structureSaved: "Вопрос добавлен" }));
}

export async function deleteQuestion(questionId: string, courseId: string) {
  await requireManageCourse(courseId);
  await manageCourseContent.deleteQuestion({ courseId, questionId });
  revalidatePath(`/courses/${courseId}/manage`);
  redirect(manageCourseUrl(courseId, { section: "structure", structureSaved: "Вопрос удален" }));
}

function manageCourseUrl(courseId: string, params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => { if (value) search.set(key, value); });
  const query = search.toString();
  return query ? `/courses/${courseId}/manage?${query}` : `/courses/${courseId}/manage`;
}

function redirectCourseStructureError(courseId: string, message: string): never {
  redirect(manageCourseUrl(courseId, { section: "structure", structureError: message }));
}
