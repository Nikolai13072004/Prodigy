"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireManageCourse } from "@/lib/auth-guards";
import { QuizBuilderApplicationError } from "@/modules/assessment/application/quiz-builder-errors";
import {
  addQuizBuilderQuestion as addQuizBuilderQuestionUseCase,
  deleteQuizBuilderQuestion as deleteQuizBuilderQuestionUseCase,
  deleteQuizFromBuilder as deleteQuizFromBuilderUseCase,
  importQuizBuilderQuestions as importQuizBuilderQuestionsUseCase,
  loadQuizBuilderQuestionForUpdate,
  moveQuizBuilderQuestion as moveQuizBuilderQuestionUseCase,
  saveQuizBuilderSettings as saveQuizBuilderSettingsUseCase,
  updateQuizBuilderQuestion as updateQuizBuilderQuestionUseCase,
} from "@/modules/assessment/server/quiz-builder";
import { parseSingleChoiceQuestionsFromDocx } from "@/lib/quiz-docx-import";
import {
  normalizeQuizQuestionMedia,
  parseQuizQuestionMediaJson,
  type QuizQuestionMedia,
} from "@/lib/quiz-question-media";

type QuestionKind = "SINGLE_CHOICE" | "OPEN" | "MATCHING" | "FILE";
type MoveDirection = "UP" | "DOWN";
type OpenReviewMode = "AUTO" | "MANUAL";
const MAX_QUIZ_DOCX_IMPORT_SIZE_BYTES = 5 * 1024 * 1024;

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function asOptionalString(formData: FormData, key: string) {
  const value = asString(formData, key);
  return value || null;
}

function asPositiveInt(formData: FormData, key: string, fallback = 1) {
  const raw = parseInt(asString(formData, key), 10);
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  return raw;
}

function asOptionalPositiveInt(formData: FormData, key: string) {
  const raw = asString(formData, key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function asStringList(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function asMultilineList(formData: FormData, key: string) {
  return asString(formData, key)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function resolveQuestionType(formData: FormData): QuestionKind | null {
  const explicit = asString(formData, "questionType");
  if (explicit === "SINGLE_CHOICE" || explicit === "OPEN" || explicit === "MATCHING" || explicit === "FILE") {
    return explicit;
  }

  // Fallback for edge-cases when hidden field is missing in submitted form.
  if (formData.has("sampleAnswer")) return "OPEN";
  if (formData.has("leftValues") || formData.has("rightValues") || formData.has("pairs")) {
    return "MATCHING";
  }
  if (formData.has("allowedExtensions") || formData.has("maxFileSizeMb")) return "FILE";
  if (formData.has("optionValues") || formData.has("options")) return "SINGLE_CHOICE";

  return null;
}

function parseOpenQuestion(formData: FormData) {
  const reviewMode = asString(formData, "reviewMode") === "MANUAL" ? "MANUAL" : "AUTO";
  const sampleAnswer = asString(formData, "sampleAnswer");

  if (reviewMode === "AUTO" && !sampleAnswer) {
    return { ok: false as const, error: "Укажите эталонный ответ" };
  }

  return {
    ok: true as const,
    reviewMode: reviewMode as OpenReviewMode,
    sampleAnswer,
  };
}

function parseFileQuestion(formData: FormData) {
  const allowedExtensions = asString(formData, "allowedExtensions")
    .split(/[,\s]+/)
    .map((value) => value.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
  const uniqueExtensions = [...new Set(allowedExtensions)];
  const maxFileSizeMb = asPositiveInt(formData, "maxFileSizeMb", 10);

  if (uniqueExtensions.length === 0) {
    return { ok: false as const, error: "Укажите хотя бы один допустимый формат файла" };
  }
  if (maxFileSizeMb < 1 || maxFileSizeMb > 200) {
    return { ok: false as const, error: "Максимальный размер файла должен быть от 1 до 200 МБ" };
  }

  return {
    ok: true as const,
    allowedExtensions: uniqueExtensions,
    maxFileSizeMb,
  };
}

function parseQuestionMedia(formData: FormData, fallback: QuizQuestionMedia | null = null) {
  if (!formData.has("questionMedia")) return { ok: true as const, media: fallback };

  const rawMedia = asString(formData, "questionMedia");
  if (!rawMedia) return { ok: true as const, media: null };

  const media = parseQuizQuestionMediaJson(rawMedia);
  if (!media) {
    return { ok: false as const, error: "Не удалось прочитать медиа вопроса" };
  }

  return { ok: true as const, media };
}

function withQuestionMedia<T extends Record<string, unknown>>(
  config: T,
  media: QuizQuestionMedia | null
) {
  return media ? { ...config, media } : config;
}

function getQuestionMediaFromConfig(configRaw: string) {
  try {
    const parsed = JSON.parse(configRaw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return normalizeQuizQuestionMedia((parsed as { media?: unknown }).media);
  } catch {
    return null;
  }
}

function builderUrl(courseId: string, quizId: string, params?: Record<string, string | undefined>) {
  const base = `/courses/${courseId}/quiz/${quizId}/builder`;
  if (!params) return base;
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

function fail(courseId: string, quizId: string, message: string): never {
  redirect(builderUrl(courseId, quizId, { error: message }));
}

function afterSave(
  courseId: string,
  quizId: string,
  message = "Сохранено",
  params?: Record<string, string | undefined>
) {
  redirect(builderUrl(courseId, quizId, { ...params, saved: message }));
}

function parseOptions(formData: FormData) {
  const options = asStringList(formData, "optionValues");
  const normalizedOptions = options.length > 0 ? options : asMultilineList(formData, "options");

  const correctIndexRaw = parseInt(asString(formData, "correctIndex"), 10) - 1;

  const correctIndex = Number.isInteger(correctIndexRaw) ? correctIndexRaw : -1;

  if (normalizedOptions.length < 2) {
    return { ok: false as const, error: "Добавьте минимум два варианта ответа" };
  }

  if (correctIndex < 0 || correctIndex >= normalizedOptions.length) {
    return { ok: false as const, error: "Выберите правильный вариант" };
  }

  return {
    ok: true as const,
    options: normalizedOptions,
    correctIndex,
  };
}

function parseMatchingPairsFromList(formData: FormData, leftLength: number, rightLength: number) {
  const rawPairs = formData.getAll("pairValues").map((value) => String(value).trim());
  if (rawPairs.length === 0) return null;

  if (rawPairs.length !== leftLength) {
    return {
      ok: false as const,
      error: "Укажите пары соответствий для каждого элемента слева",
    };
  }

  const correctPairs = rawPairs.map((value) => parseInt(value, 10) - 1);
  const hasInvalidPair =
    correctPairs.some((index) => !Number.isInteger(index) || index < 0 || index >= rightLength);

  if (hasInvalidPair) {
    return {
      ok: false as const,
      error: "Укажите корректные пары соответствий",
    };
  }

  return { ok: true as const, correctPairs };
}

function parseMatchingPairsFromText(formData: FormData, left: string[], right: string[]) {
  const pairsRaw = asString(formData, "pairs");
  const correctPairs = new Array(left.length).fill(-1);

  for (const part of pairsRaw.split(/[,;]/).map((value) => value.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)\s*[:=]\s*(\d+)$/);
    if (!match) {
      return {
        ok: false as const,
        error: `Неверный формат пары: ${part}. Используйте, например, 1:2`,
      };
    }
    const leftIndex = parseInt(match[1], 10) - 1;
    const rightIndex = parseInt(match[2], 10) - 1;
    if (leftIndex < 0 || leftIndex >= left.length || rightIndex < 0 || rightIndex >= right.length) {
      return { ok: false as const, error: `Пара ${part} выходит за границы элементов` };
    }
    correctPairs[leftIndex] = rightIndex;
  }

  if (correctPairs.some((value) => value < 0)) {
    return { ok: false as const, error: "Укажите пары соответствий для каждого элемента слева" };
  }

  return { ok: true as const, correctPairs };
}

function parseMatching(formData: FormData) {
  const leftFromList = asStringList(formData, "leftValues");
  const rightFromList = asStringList(formData, "rightValues");

  const left = leftFromList.length > 0 ? leftFromList : asMultilineList(formData, "left");
  const right = rightFromList.length > 0 ? rightFromList : asMultilineList(formData, "right");

  if (left.length < 2 || right.length < 2) {
    return {
      ok: false as const,
      error: "Для соответствия нужно минимум по 2 элемента слева и справа",
    };
  }

  const listBasedPairs = parseMatchingPairsFromList(formData, left.length, right.length);
  if (listBasedPairs && !listBasedPairs.ok) {
    return listBasedPairs;
  }

  if (listBasedPairs?.ok) {
    return {
      ok: true as const,
      left,
      right,
      correctPairs: listBasedPairs.correctPairs,
    };
  }

  const textBasedPairs = parseMatchingPairsFromText(formData, left, right);
  if (!textBasedPairs.ok) {
    return textBasedPairs;
  }

  return { ok: true as const, left, right, correctPairs: textBasedPairs.correctPairs };
}

export async function saveQuizBuilderSettings(courseId: string, quizId: string, formData: FormData) {
  await requireAdmin();
  await requireManageCourse(courseId);

  try {
    await saveQuizBuilderSettingsUseCase({
      courseId,
      quizId,
      settings: {
        title: asString(formData, "title"),
        description: asOptionalString(formData, "description"),
        maxAttempts: asPositiveInt(formData, "maxAttempts", 1),
        minCorrectAnswers: asPositiveInt(formData, "minCorrectAnswers", 1),
        timeLimitMinutes: asOptionalPositiveInt(formData, "timeLimitMinutes"),
        questionPoolSize: asOptionalPositiveInt(formData, "questionPoolSize"),
        retryDelayMinutes: asOptionalPositiveInt(formData, "retryDelayMinutes"),
        shuffleQuestions: formData.get("shuffleQuestions") === "1",
        shuffleAnswers: formData.get("shuffleAnswers") === "1",
        lockMaterialsOnStart: formData.get("lockMaterialsOnStart") === "1",
        trackSecurityEvents: formData.get("trackSecurityEvents") === "1",
        resultViewMode: asString(formData, "resultViewMode"),
      },
    });
  } catch (error) {
    if (error instanceof QuizBuilderApplicationError) {
      fail(courseId, quizId, error.message);
    }
    throw error;
  }

  revalidatePath(`/courses/${courseId}/manage`);
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(builderUrl(courseId, quizId));
  afterSave(courseId, quizId);
}

export async function addQuizBuilderQuestion(courseId: string, quizId: string, formData: FormData) {
  await requireAdmin();
  await requireManageCourse(courseId);

  const questionType = resolveQuestionType(formData);
  const prompt = asString(formData, "prompt");
  const points = asPositiveInt(formData, "points", 1);
  const mediaResult = parseQuestionMedia(formData);
  if (!mediaResult.ok) fail(courseId, quizId, mediaResult.error);

  const data = buildQuestionDataFromForm(courseId, quizId, {
    type: questionType,
    prompt,
    points,
    media: mediaResult.media,
    formData,
  });

  let result;
  try {
    result = await addQuizBuilderQuestionUseCase({
      courseId,
      quizId,
      data,
    });
  } catch (error) {
    if (error instanceof QuizBuilderApplicationError) {
      fail(courseId, quizId, error.message);
    }
    throw error;
  }

  revalidatePath(builderUrl(courseId, quizId));
  afterSave(courseId, quizId, "Вопрос добавлен", { edit: result.questionId });
}

// Собирает {type, prompt, points, config} по типу вопроса. Парсинг остаётся
// в транспорте, потому что политики (пары/варианты/файлы) заведены на форму
// целиком, а не только на config. Ошибки парсинга — прямой fail() редирект.
function buildQuestionDataFromForm(
  courseId: string,
  quizId: string,
  input: {
    type: QuestionKind | null;
    prompt: string;
    points: number;
    media: QuizQuestionMedia | null;
    formData: FormData;
  },
) {
  if (input.type === "SINGLE_CHOICE") {
    const parsed = parseOptions(input.formData);
    if (!parsed.ok) fail(courseId, quizId, parsed.error);
    return {
      type: input.type,
      prompt: input.prompt,
      points: input.points,
      config: JSON.stringify(
        withQuestionMedia(
          { options: parsed.options, correctIndex: parsed.correctIndex },
          input.media,
        ),
      ),
    };
  }
  if (input.type === "OPEN") {
    const parsed = parseOpenQuestion(input.formData);
    if (!parsed.ok) fail(courseId, quizId, parsed.error);
    return {
      type: input.type,
      prompt: input.prompt,
      points: input.points,
      config: JSON.stringify(
        withQuestionMedia(
          { sampleAnswer: parsed.sampleAnswer, reviewMode: parsed.reviewMode },
          input.media,
        ),
      ),
    };
  }
  if (input.type === "MATCHING") {
    const parsed = parseMatching(input.formData);
    if (!parsed.ok) fail(courseId, quizId, parsed.error);
    return {
      type: input.type,
      prompt: input.prompt,
      points: input.points,
      config: JSON.stringify(
        withQuestionMedia(
          {
            left: parsed.left,
            right: parsed.right,
            correctPairs: parsed.correctPairs,
          },
          input.media,
        ),
      ),
    };
  }
  if (input.type === "FILE") {
    const parsed = parseFileQuestion(input.formData);
    if (!parsed.ok) fail(courseId, quizId, parsed.error);
    return {
      type: input.type,
      prompt: input.prompt,
      points: input.points,
      config: JSON.stringify(
        withQuestionMedia(
          {
            allowedExtensions: parsed.allowedExtensions,
            maxFileSizeMb: parsed.maxFileSizeMb,
          },
          input.media,
        ),
      ),
    };
  }
  fail(courseId, quizId, "Выберите тип вопроса");
}

export async function importQuizBuilderQuestionsFromDocx(
  courseId: string,
  quizId: string,
  formData: FormData
) {
  await requireAdmin();
  await requireManageCourse(courseId);

  const upload = formData.get("docxFile");
  if (!(upload instanceof File) || upload.size === 0) {
    fail(courseId, quizId, "Выберите DOCX-файл с вопросами");
  }

  const fileName = upload.name.toLowerCase();
  if (!fileName.endsWith(".docx")) {
    fail(courseId, quizId, "Поддерживаются только файлы .docx");
  }

  if (upload.size > MAX_QUIZ_DOCX_IMPORT_SIZE_BYTES) {
    fail(courseId, quizId, "DOCX-файл должен быть не больше 5 МБ");
  }

  let parsedQuestions: ReturnType<typeof parseSingleChoiceQuestionsFromDocx>;
  try {
    parsedQuestions = parseSingleChoiceQuestionsFromDocx(
      Buffer.from(await upload.arrayBuffer()),
    );
  } catch (error) {
    fail(
      courseId,
      quizId,
      error instanceof Error ? error.message : "Не удалось прочитать DOCX-файл"
    );
  }

  let result;
  try {
    result = await importQuizBuilderQuestionsUseCase({
      courseId,
      quizId,
      questions: parsedQuestions.map((question) => ({
        type: "SINGLE_CHOICE",
        prompt: question.prompt,
        points: 1,
        config: JSON.stringify({
          options: question.options,
          correctIndex: question.correctIndex,
        }),
      })),
    });
  } catch (error) {
    if (error instanceof QuizBuilderApplicationError) {
      fail(courseId, quizId, error.message);
    }
    throw error;
  }

  revalidatePath(builderUrl(courseId, quizId));
  afterSave(
    courseId,
    quizId,
    `Импортировано вопросов: ${result.createdCount}. Дубликаты пропущены: ${result.duplicatesSkipped}`,
    { edit: result.firstCreatedQuestionId ?? undefined }
  );
}

export async function updateQuizBuilderQuestion(
  courseId: string,
  quizId: string,
  questionId: string,
  formData: FormData
) {
  await requireAdmin();
  await requireManageCourse(courseId);

  const existing = await loadQuizBuilderQuestionForUpdate(courseId, quizId, questionId);
  if (!existing) {
    fail(courseId, quizId, "Вопрос не найден");
  }

  const prompt = asString(formData, "prompt");
  const points = asPositiveInt(formData, "points", 1);
  const mediaResult = parseQuestionMedia(formData, getQuestionMediaFromConfig(existing.config));
  if (!mediaResult.ok) fail(courseId, quizId, mediaResult.error);

  const data = buildQuestionDataFromForm(courseId, quizId, {
    type: existing.type as QuestionKind,
    prompt,
    points,
    media: mediaResult.media,
    formData,
  });

  try {
    await updateQuizBuilderQuestionUseCase({
      courseId,
      quizId,
      questionId,
      data,
    });
  } catch (error) {
    if (error instanceof QuizBuilderApplicationError) {
      fail(courseId, quizId, error.message);
    }
    throw error;
  }

  revalidatePath(builderUrl(courseId, quizId));
  afterSave(courseId, quizId, "Вопрос обновлен", { edit: questionId });
}

export async function moveQuizBuilderQuestion(
  courseId: string,
  quizId: string,
  questionId: string,
  direction: MoveDirection
) {
  await requireAdmin();
  await requireManageCourse(courseId);

  let result;
  try {
    result = await moveQuizBuilderQuestionUseCase({
      courseId,
      quizId,
      questionId,
      direction,
    });
  } catch (error) {
    if (error instanceof QuizBuilderApplicationError) {
      fail(courseId, quizId, error.message);
    }
    throw error;
  }

  if (!result.moved) {
    redirect(builderUrl(courseId, quizId));
  }

  revalidatePath(builderUrl(courseId, quizId));
  afterSave(courseId, quizId, "Порядок вопросов обновлен", { edit: questionId });
}

export async function deleteQuizBuilderQuestion(
  courseId: string,
  quizId: string,
  questionId: string
) {
  await requireAdmin();
  await requireManageCourse(courseId);

  try {
    await deleteQuizBuilderQuestionUseCase({
      courseId,
      quizId,
      questionId,
      now: new Date(),
    });
  } catch (error) {
    if (error instanceof QuizBuilderApplicationError) {
      fail(courseId, quizId, error.message);
    }
    throw error;
  }

  revalidatePath(builderUrl(courseId, quizId));
  afterSave(courseId, quizId, "Вопрос удален");
}

export async function deleteQuizFromBuilder(courseId: string, quizId: string) {
  await requireAdmin();
  await requireManageCourse(courseId);

  try {
    await deleteQuizFromBuilderUseCase({
      courseId,
      quizId,
      now: new Date(),
    });
  } catch (error) {
    if (error instanceof QuizBuilderApplicationError) {
      fail(courseId, quizId, error.message);
    }
    throw error;
  }

  revalidatePath(`/courses/${courseId}/manage`);
  revalidatePath(`/courses/${courseId}`);
  redirect(`/courses/${courseId}/manage`);
}
