"use server";

import type { Prisma } from "@prisma/client";
import { access } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guards";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import { normalizePresentationViewMode, type PresentationViewMode } from "@/lib/constants";
import { type CourseTemplateKey, getCourseTemplateLabel, isCourseTemplateKey } from "@/lib/course-creation-options";
import { asOptionalPositiveInt, asOptionalString, asString, parseCourseMetadata, parsePresentationViewMode } from "./course-action-input";

const UPLOADS_ROOT = path.resolve(process.cwd(), "public", "uploads");

function localUploadsPathFromUrl(urlValue: string) {
  const cleanPath = urlValue.split("?")[0].split("#")[0];
  if (!cleanPath.startsWith("/uploads/")) return null;

  const relativePath = cleanPath.replace(/^\/uploads\/?/, "");
  const segments = relativePath.split("/").filter(Boolean).map(decodeURIComponent);
  const filePath = path.resolve(UPLOADS_ROOT, ...segments);
  const rootPrefix = UPLOADS_ROOT.endsWith(path.sep) ? UPLOADS_ROOT : `${UPLOADS_ROOT}${path.sep}`;
  if (!filePath.startsWith(rootPrefix)) return null;
  return filePath;
}

async function uploadedFileExists(urlValue: string) {
  const filePath = localUploadsPathFromUrl(urlValue);
  if (!filePath) return false;

  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolvePresentationFileUrlFromForm(
  fileUrl: string | null,
  presentationPreviewUrl: string | null,
  presentationViewMode: PresentationViewMode
) {
  if (fileUrl) return fileUrl;
  if (!presentationPreviewUrl) return null;

  if (presentationViewMode === "PPTX_HTML5" && /\.pdf(\?|#|$)/i.test(presentationPreviewUrl)) {
    const pptxUrl = presentationPreviewUrl.replace(/\.pdf(\?|#|$)/i, ".pptx$1");
    if (await uploadedFileExists(pptxUrl)) return pptxUrl;
  }

  if (await uploadedFileExists(presentationPreviewUrl)) return presentationPreviewUrl;
  return null;
}
function newCourseUrl(params?: Record<string, string | undefined>) {
  const base = "/courses/new";
  if (!params) return base;
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

function courseCreationFormParams(formData: FormData, params?: Record<string, string | undefined>) {
  return {
    title: asString(formData, "title"),
    description: asOptionalString(formData, "description") ?? "",
    category: asString(formData, "category"),
    difficultyLevel: asString(formData, "difficultyLevel"),
    durationHours: asString(formData, "durationHours"),
    durationMinutes: asString(formData, "durationMinutes"),
    coverUrl: asOptionalString(formData, "coverUrl") ?? undefined,
    ...params,
  };
}

export async function createCourse(formData: FormData) {
  const session = await requireAdmin();
  const title = asString(formData, "title");
  const description = asOptionalString(formData, "description");
  const category = asString(formData, "category");
  const difficultyLevel = asString(formData, "difficultyLevel");
  const durationHours = asString(formData, "durationHours");
  const durationMinutesRaw = asString(formData, "durationMinutes");
  const coverUrlRaw = asOptionalString(formData, "coverUrl");

  if (!title || !description) {
    redirect(
      newCourseUrl({
        error: !title ? "Название курса обязательно." : "Описание курса обязательно.",
        title,
        description: description ?? "",
        category,
        difficultyLevel,
        durationHours,
        durationMinutes: durationMinutesRaw,
        coverUrl: coverUrlRaw ?? undefined,
      })
    );
  }

  let metadata: ReturnType<typeof parseCourseMetadata>;
  try {
    metadata = parseCourseMetadata(formData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Проверьте карточку курса.";
    redirect(
      newCourseUrl({
        error: message,
        title,
        description: description ?? "",
        category,
        difficultyLevel,
        durationHours,
        durationMinutes: durationMinutesRaw,
        coverUrl: coverUrlRaw ?? undefined,
      })
    );
  }

  const course = await prisma.course.create({
    data: {
      title,
      description,
      category: metadata.category,
      difficultyLevel: metadata.difficultyLevel,
      durationMinutes: metadata.durationMinutes,
      thumbnailUrl: metadata.thumbnailUrl,
      coverUrl: metadata.coverUrl,
      ownerId: session.user.id,
    },
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "courses:create",
    objectType: "course",
    objectId: course.id,
    objectLabel: course.title,
    metadata: {
      description,
      category: metadata.category,
      difficultyLevel: metadata.difficultyLevel,
      durationMinutes: metadata.durationMinutes,
      thumbnailUrl: metadata.thumbnailUrl,
      coverUrl: metadata.coverUrl,
      ownerId: session.user.id,
    },
  });

  revalidatePath("/");
  revalidatePath("/courses");
  redirect(`/courses/${course.id}/manage?section=structure`);
}

type TemplateItemBlueprint = {
  moduleIndex: number;
  type: "TEXT" | "PDF" | "VIDEO" | "QUIZ";
  title: string;
  content?: string | null;
  isRequired?: boolean;
};

type TemplateModuleBlueprint = {
  title: string;
  description?: string | null;
};

function getCourseTemplateBlueprint(templateKey: CourseTemplateKey): {
  modules: TemplateModuleBlueprint[];
  items: TemplateItemBlueprint[];
} {
  if (templateKey === "presentation_with_quiz") {
    return {
      modules: [
        {
          title: "Материалы курса",
          description: "Добавьте презентацию и сопроводительные материалы.",
        },
        {
          title: "Проверка знаний",
          description: "Настройте вопросы итогового теста.",
        },
      ],
      items: [
        {
          moduleIndex: 0,
          type: "PDF",
          title: "Презентация",
          isRequired: true,
        },
        {
          moduleIndex: 1,
          type: "QUIZ",
          title: "Итоговый тест",
          isRequired: true,
        },
      ],
    };
  }

  if (templateKey === "required_training") {
    return {
      modules: [
        {
          title: "Обязательные материалы",
          description: "Основная информация, которую нужно изучить всем назначенным ученикам.",
        },
        {
          title: "Контроль понимания",
          description: "Закрепление и финальная проверка.",
        },
      ],
      items: [
        {
          moduleIndex: 0,
          type: "TEXT",
          title: "Инструкция",
          content: "<p>Опишите правила, регламент или порядок действий.</p>",
          isRequired: true,
        },
        {
          moduleIndex: 0,
          type: "PDF",
          title: "Презентация",
          isRequired: true,
        },
        {
          moduleIndex: 1,
          type: "QUIZ",
          title: "Финальный тест",
          isRequired: true,
        },
      ],
    };
  }

  return {
    modules: [
      {
        title: "Введение",
        description: "Цели курса и краткий контекст.",
      },
      {
        title: "Основная часть",
        description: "Ключевые материалы и практические примеры.",
      },
      {
        title: "Закрепление",
        description: "Итоги, проверка знаний и дополнительные материалы.",
      },
    ],
    items: [
      {
        moduleIndex: 0,
        type: "TEXT",
        title: "О курсе",
        content: "<p>Опишите цели курса, аудиторию и ожидаемый результат.</p>",
        isRequired: true,
      },
      {
        moduleIndex: 1,
        type: "TEXT",
        title: "Основной материал",
        content: "<p>Добавьте структуру, тезисы и ссылки на рабочие материалы.</p>",
        isRequired: true,
      },
      {
        moduleIndex: 2,
        type: "QUIZ",
        title: "Проверка знаний",
        isRequired: true,
      },
    ],
  };
}

async function createTemplateItems(
  tx: Prisma.TransactionClient,
  courseId: string,
  moduleIds: string[],
  items: TemplateItemBlueprint[]
) {
  let orderIndex = 0;
  for (const item of items) {
    await tx.courseItem.create({
      data: {
        courseId,
        moduleId: moduleIds[item.moduleIndex] ?? null,
        orderIndex,
        type: item.type,
        title: item.title,
        content: item.type === "TEXT" ? item.content ?? "<p>Заполните содержание материала.</p>" : null,
        fileUrl: null,
        totalSlides: null,
        isRequired: item.isRequired ?? true,
        quiz:
          item.type === "QUIZ"
            ? {
                create: {
                  maxAttempts: 2,
                  minCorrectAnswers: 1,
                },
              }
            : undefined,
      },
    });
    orderIndex += 1;
  }
}

export async function createCourseFromPresentation(formData: FormData) {
  const session = await requireAdmin();
  const title = asString(formData, "title");
  const description = asOptionalString(formData, "description");
  const submittedFileUrl = asOptionalString(formData, "fileUrl");
  const presentationPreviewUrl = asOptionalString(formData, "presentationPreviewUrl");
  const presentationViewMode = parsePresentationViewMode(formData);
  const fileUrl = await resolvePresentationFileUrlFromForm(
    submittedFileUrl,
    presentationPreviewUrl,
    presentationViewMode
  );
  const totalSlides = asOptionalPositiveInt(formData, "totalSlides");
  const moduleTitle = asString(formData, "moduleTitle") || "Материалы курса";
  const presentationTitle = asString(formData, "presentationTitle") || "Презентация";
  const includeQuiz = formData.getAll("includeQuiz").map(String).includes("1");

  const redirectParams = courseCreationFormParams(formData, {
    mode: "presentation",
    moduleTitle,
    presentationTitle,
    fileUrl: fileUrl ?? submittedFileUrl ?? undefined,
    presentationPreviewUrl: presentationPreviewUrl ?? undefined,
    presentationViewMode,
    totalSlides: totalSlides ? String(totalSlides) : undefined,
    includeQuiz: includeQuiz ? "1" : "0",
  });

  if (!title || !description) {
    redirect(
      newCourseUrl({
        ...redirectParams,
        error: !title ? "Название курса обязательно." : "Описание курса обязательно.",
      })
    );
  }
  if (!fileUrl) {
    redirect(
      newCourseUrl({
        ...redirectParams,
        error: "Файл презентации не найден. Загрузите PDF/PPTX еще раз.",
      })
    );
  }
  if (!totalSlides) {
    redirect(
      newCourseUrl({
        ...redirectParams,
        error: "Не удалось определить количество слайдов. Загрузите PDF/PPTX еще раз.",
      })
    );
  }

  let metadata: ReturnType<typeof parseCourseMetadata>;
  try {
    metadata = parseCourseMetadata(formData);
  } catch (error) {
    redirect(
      newCourseUrl({
        ...redirectParams,
        error: error instanceof Error ? error.message : "Проверьте карточку курса.",
      })
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const createdCourse = await tx.course.create({
      data: {
        title,
        description,
        category: metadata.category,
        difficultyLevel: metadata.difficultyLevel,
        durationMinutes: metadata.durationMinutes,
        thumbnailUrl: metadata.thumbnailUrl,
        coverUrl: metadata.coverUrl,
        ownerId: session.user.id,
      },
    });
    const courseModule = await tx.courseModule.create({
      data: {
        courseId: createdCourse.id,
        title: moduleTitle,
        orderIndex: 0,
      },
    });
    await tx.courseItem.create({
      data: {
        courseId: createdCourse.id,
        moduleId: courseModule.id,
        orderIndex: 0,
        type: "PDF",
        title: presentationTitle,
        fileUrl,
        totalSlides,
        presentationViewMode,
        isRequired: true,
      },
    });
    let quizId: string | null = null;
    if (includeQuiz) {
      const quizItem = await tx.courseItem.create({
        data: {
          courseId: createdCourse.id,
          moduleId: courseModule.id,
          orderIndex: 1,
          type: "QUIZ",
          title: "Итоговый тест",
          isRequired: true,
          quiz: {
            create: {
              maxAttempts: 2,
              minCorrectAnswers: 1,
            },
          },
        },
        include: {
          quiz: {
            select: {
              id: true,
            },
          },
        },
      });
      quizId = quizItem.quiz?.id ?? null;
    }
    return { course: createdCourse, quizId };
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "courses:create_from_presentation",
    objectType: "course",
    objectId: created.course.id,
    objectLabel: created.course.title,
    metadata: { fileUrl, totalSlides, presentationViewMode, includeQuiz },
  });

  revalidatePath("/");
  revalidatePath("/courses");
  if (created.quizId) {
    redirect(
      `/courses/${created.course.id}/quiz/${created.quizId}/builder?saved=${encodeURIComponent(
        "Курс создан. Добавьте вопросы итогового теста."
      )}`
    );
  }
  redirect(
    manageCourseUrl(created.course.id, {
      section: "structure",
      structureSaved: "Курс создан из презентации",
    })
  );
}

export async function createCourseFromTemplate(formData: FormData) {
  const session = await requireAdmin();
  const title = asString(formData, "title");
  const description = asOptionalString(formData, "description");
  const templateKeyRaw = asString(formData, "templateKey");

  const redirectParams = courseCreationFormParams(formData, {
    mode: "template",
    templateKey: templateKeyRaw,
  });

  if (!isCourseTemplateKey(templateKeyRaw)) {
    redirect(newCourseUrl({ ...redirectParams, error: "Выберите шаблон курса." }));
  }
  if (!title || !description) {
    redirect(
      newCourseUrl({
        ...redirectParams,
        error: !title ? "Название курса обязательно." : "Описание курса обязательно.",
      })
    );
  }

  let metadata: ReturnType<typeof parseCourseMetadata>;
  try {
    metadata = parseCourseMetadata(formData);
  } catch (error) {
    redirect(
      newCourseUrl({
        ...redirectParams,
        error: error instanceof Error ? error.message : "Проверьте карточку курса.",
      })
    );
  }

  const blueprint = getCourseTemplateBlueprint(templateKeyRaw);
  const course = await prisma.$transaction(async (tx) => {
    const createdCourse = await tx.course.create({
      data: {
        title,
        description,
        category: metadata.category,
        difficultyLevel: metadata.difficultyLevel,
        durationMinutes: metadata.durationMinutes,
        coverUrl: metadata.coverUrl,
        ownerId: session.user.id,
      },
    });
    const moduleIds: string[] = [];
    for (const [index, moduleBlueprint] of blueprint.modules.entries()) {
      const createdModule = await tx.courseModule.create({
        data: {
          courseId: createdCourse.id,
          title: moduleBlueprint.title,
          description: moduleBlueprint.description ?? null,
          orderIndex: index,
        },
      });
      moduleIds.push(createdModule.id);
    }
    await createTemplateItems(tx, createdCourse.id, moduleIds, blueprint.items);
    return createdCourse;
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "courses:create_from_template",
    objectType: "course",
    objectId: course.id,
    objectLabel: course.title,
    metadata: { templateKey: templateKeyRaw, templateLabel: getCourseTemplateLabel(templateKeyRaw) },
  });

  revalidatePath("/");
  revalidatePath("/courses");
  redirect(
    manageCourseUrl(course.id, {
      section: "structure",
      structureSaved: `Курс создан по шаблону «${getCourseTemplateLabel(templateKeyRaw)}»`,
    })
  );
}

export async function copyCourse(formData: FormData) {
  const session = await requireAdmin();
  const sourceCourseId = asString(formData, "sourceCourseId");
  if (!sourceCourseId) {
    redirect(newCourseUrl({ mode: "copy", error: "Выберите курс для копирования." }));
  }

  const sourceCourse = await prisma.course.findUnique({
    where: { id: sourceCourseId },
    include: {
      modules: {
        where: { archivedAt: null },
        orderBy: { orderIndex: "asc" },
      },
      items: {
        where: { archivedAt: null },
        orderBy: { orderIndex: "asc" },
        include: {
          quiz: {
            include: {
              questions: {
                where: { archivedAt: null },
                orderBy: { orderIndex: "asc" },
              },
            },
          },
        },
      },
    },
  });
  if (!sourceCourse) {
    redirect(newCourseUrl({ mode: "copy", sourceCourseId, error: "Курс для копирования не найден." }));
  }

  const title = asString(formData, "title") || `${sourceCourse.title} — копия`;
  const description = asOptionalString(formData, "description") ?? sourceCourse.description ?? "Копия курса.";

  const course = await prisma.$transaction(async (tx) => {
    const createdCourse = await tx.course.create({
      data: {
        title,
        description,
        requirements: sourceCourse.requirements,
        targetAudience: sourceCourse.targetAudience,
        category: sourceCourse.category,
        difficultyLevel: sourceCourse.difficultyLevel,
        durationMinutes: sourceCourse.durationMinutes,
        tagsJson: sourceCourse.tagsJson,
        thumbnailUrl: sourceCourse.thumbnailUrl,
        coverUrl: sourceCourse.coverUrl,
        navigationMode: sourceCourse.navigationMode,
        quizGateMode: sourceCourse.quizGateMode,
        completionMode: sourceCourse.completionMode,
        statusFormat: sourceCourse.statusFormat,
        gradedItemIdsJson: sourceCourse.gradedItemIdsJson,
        resultViewMode: sourceCourse.resultViewMode,
        ownerId: session.user.id,
      },
    });

    const moduleIdMap = new Map<string, string>();
    for (const sourceModule of sourceCourse.modules) {
      const createdModule = await tx.courseModule.create({
        data: {
          courseId: createdCourse.id,
          title: sourceModule.title,
          description: sourceModule.description,
          orderIndex: sourceModule.orderIndex,
        },
      });
      moduleIdMap.set(sourceModule.id, createdModule.id);
    }

    for (const item of sourceCourse.items) {
      await tx.courseItem.create({
        data: {
          courseId: createdCourse.id,
          moduleId: item.moduleId ? moduleIdMap.get(item.moduleId) ?? null : null,
          orderIndex: item.orderIndex,
          type: item.type,
          title: item.title,
          content: item.content,
          fileUrl: item.fileUrl,
          totalSlides: item.totalSlides,
          presentationViewMode: normalizePresentationViewMode(item.presentationViewMode),
          isRequired: item.isRequired,
          quiz: item.quiz
            ? {
                create: {
                  description: item.quiz.description,
                  maxAttempts: item.quiz.maxAttempts,
                  minCorrectAnswers: item.quiz.minCorrectAnswers,
                  questions: {
                    create: item.quiz.questions.map((question) => ({
                      orderIndex: question.orderIndex,
                      type: question.type,
                      prompt: question.prompt,
                      config: question.config,
                      points: question.points,
                    })),
                  },
                },
              }
            : undefined,
        },
      });
    }

    return createdCourse;
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "courses:copy",
    objectType: "course",
    objectId: course.id,
    objectLabel: course.title,
    metadata: { sourceCourseId: sourceCourse.id, sourceTitle: sourceCourse.title },
  });

  revalidatePath("/");
  revalidatePath("/courses");
  redirect(manageCourseUrl(course.id, { section: "structure", structureSaved: "Курс скопирован" }));
}

function manageCourseUrl(courseId: string, params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => { if (value) search.set(key, value); });
  const query = search.toString();
  return query ? `/courses/${courseId}/manage?${query}` : `/courses/${courseId}/manage`;
}
