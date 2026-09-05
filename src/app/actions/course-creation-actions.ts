"use server";

import { access } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-guards";
import {
  auditActorFromSessionUser,
  getAuditRequestContext,
} from "@/lib/audit-log";
import type { PresentationViewMode } from "@/lib/constants";
import { storage } from "@/lib/storage";
import {
  getCourseTemplateLabel,
  isCourseTemplateKey,
} from "@/lib/course-creation-options";
import { presentationFileUrlCandidates } from "@/modules/course/domain/presentation-file-url";
import { CourseCreationApplicationError } from "@/modules/course/application/creation-errors";
import {
  copyCourse as copyCourseUseCase,
  createCourse as createCourseUseCase,
  createCourseFromPresentation as createCourseFromPresentationUseCase,
  createCourseFromTemplate as createCourseFromTemplateUseCase,
} from "@/modules/course/server/creation";
import {
  asOptionalPositiveInt,
  asOptionalString,
  asString,
  parseCourseMetadata,
  parsePresentationViewMode,
} from "./course-action-input";

const UPLOADS_ROOT = storage.rootPath("uploads");

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
  presentationViewMode: PresentationViewMode,
) {
  if (fileUrl) return fileUrl;
  if (!presentationPreviewUrl) return null;
  for (const candidate of presentationFileUrlCandidates(
    presentationPreviewUrl,
    presentationViewMode,
  )) {
    if (await uploadedFileExists(candidate)) return candidate;
  }
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

function manageCourseUrl(
  courseId: string,
  params?: Record<string, string | undefined>,
) {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query
    ? `/courses/${courseId}/manage?${query}`
    : `/courses/${courseId}/manage`;
}

function courseCreationFormParams(
  formData: FormData,
  params?: Record<string, string | undefined>,
) {
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

  let metadata: ReturnType<typeof parseCourseMetadata>;
  try {
    metadata = parseCourseMetadata(formData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Проверьте карточку курса.";
    redirect(
      newCourseUrl({
        ...courseCreationFormParams(formData),
        error: message,
      }),
    );
  }

  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);

  let result;
  try {
    result = await createCourseUseCase({
      data: {
        title,
        description: description ?? "",
        category: metadata.category,
        difficultyLevel: metadata.difficultyLevel,
        durationMinutes: metadata.durationMinutes,
        thumbnailUrl: metadata.thumbnailUrl,
        coverUrl: metadata.coverUrl,
        ownerId: session.user.id,
      },
      actor: { id: actor.id, login: actor.login, name: actor.name },
      audit: {
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
    });
  } catch (error) {
    if (error instanceof CourseCreationApplicationError) {
      redirect(
        newCourseUrl({
          ...courseCreationFormParams(formData),
          error: error.message,
        }),
      );
    }
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/courses");
  redirect(`/courses/${result.courseId}/manage?section=structure`);
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
    presentationViewMode,
  );
  const totalSlides = asOptionalPositiveInt(formData, "totalSlides");
  const moduleTitle = asString(formData, "moduleTitle") || "Материалы курса";
  const presentationTitle =
    asString(formData, "presentationTitle") || "Презентация";
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

  let metadata: ReturnType<typeof parseCourseMetadata>;
  try {
    metadata = parseCourseMetadata(formData);
  } catch (error) {
    redirect(
      newCourseUrl({
        ...redirectParams,
        error: error instanceof Error ? error.message : "Проверьте карточку курса.",
      }),
    );
  }

  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);

  let result;
  try {
    result = await createCourseFromPresentationUseCase({
      data: {
        title,
        description: description ?? "",
        category: metadata.category,
        difficultyLevel: metadata.difficultyLevel,
        durationMinutes: metadata.durationMinutes,
        thumbnailUrl: metadata.thumbnailUrl,
        coverUrl: metadata.coverUrl,
        ownerId: session.user.id,
      },
      moduleTitle,
      presentationTitle,
      fileUrl: fileUrl ?? "",
      totalSlides: totalSlides ?? 0,
      presentationViewMode,
      includeQuiz,
      actor: { id: actor.id, login: actor.login, name: actor.name },
      audit: {
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
    });
  } catch (error) {
    if (error instanceof CourseCreationApplicationError) {
      redirect(newCourseUrl({ ...redirectParams, error: error.message }));
    }
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/courses");
  if (result.quizId) {
    redirect(
      `/courses/${result.courseId}/quiz/${result.quizId}/builder?saved=${encodeURIComponent(
        "Курс создан. Добавьте вопросы итогового теста.",
      )}`,
    );
  }
  redirect(
    manageCourseUrl(result.courseId, {
      section: "structure",
      structureSaved: "Курс создан из презентации",
    }),
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

  let metadata: ReturnType<typeof parseCourseMetadata>;
  try {
    metadata = parseCourseMetadata(formData);
  } catch (error) {
    redirect(
      newCourseUrl({
        ...redirectParams,
        error: error instanceof Error ? error.message : "Проверьте карточку курса.",
      }),
    );
  }

  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);

  let result;
  try {
    result = await createCourseFromTemplateUseCase({
      data: {
        title,
        description: description ?? "",
        category: metadata.category,
        difficultyLevel: metadata.difficultyLevel,
        durationMinutes: metadata.durationMinutes,
        coverUrl: metadata.coverUrl,
        thumbnailUrl: metadata.thumbnailUrl,
        ownerId: session.user.id,
      },
      templateKey: templateKeyRaw,
      templateLabel: getCourseTemplateLabel(templateKeyRaw),
      actor: { id: actor.id, login: actor.login, name: actor.name },
      audit: {
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
    });
  } catch (error) {
    if (error instanceof CourseCreationApplicationError) {
      redirect(newCourseUrl({ ...redirectParams, error: error.message }));
    }
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/courses");
  redirect(
    manageCourseUrl(result.courseId, {
      section: "structure",
      structureSaved: `Курс создан по шаблону «${getCourseTemplateLabel(templateKeyRaw)}»`,
    }),
  );
}

export async function copyCourse(formData: FormData) {
  const session = await requireAdmin();
  const sourceCourseId = asString(formData, "sourceCourseId");
  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);

  let result;
  try {
    result = await copyCourseUseCase({
      sourceCourseId,
      ownerId: session.user.id,
      titleOverride: asString(formData, "title") || null,
      descriptionOverride: asOptionalString(formData, "description"),
      actor: { id: actor.id, login: actor.login, name: actor.name },
      audit: {
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
    });
  } catch (error) {
    if (error instanceof CourseCreationApplicationError) {
      redirect(
        newCourseUrl({
          mode: "copy",
          sourceCourseId,
          error: error.message,
        }),
      );
    }
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/courses");
  redirect(
    manageCourseUrl(result.courseId, {
      section: "structure",
      structureSaved: "Курс скопирован",
    }),
  );
}
