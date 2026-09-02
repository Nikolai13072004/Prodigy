"use server";

import { appBaseUrl } from "@/lib/app-base-url";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCourseWorkspaceAccess, requireSession } from "@/lib/auth-guards";
import {
  auditActorFromSessionUser,
  getAuditRequestContext,
} from "@/lib/audit-log";
import { enqueueCourseSurveyReportEmails } from "@/lib/email/queue";
import {
  formatCourseSurveyTitle,
  parseCourseSurveyQuestionOptionsJson,
  parseCourseSurveyQuestionsJson,
  serializeCourseSurveyQuestionOptions,
} from "@/lib/course-surveys";
import { canTrackMaterialProgress, ROLES, hasRole } from "@/lib/roles";
import { SurveyApplicationError } from "@/modules/survey/application/errors";
import {
  applyReusableCourseItemSurveyTemplate as applyReusableCourseItemSurveyTemplateUseCase,
  applyReusableCourseSurveyTemplate as applyReusableCourseSurveyTemplateUseCase,
  saveCourseItemSurveyTemplate as saveCourseItemSurveyTemplateUseCase,
  saveCourseSurveyTemplate as saveCourseSurveyTemplateUseCase,
} from "@/modules/survey/server/templates";
import {
  submitCourseItemSurvey as submitCourseItemSurveyUseCase,
  submitCourseSurvey as submitCourseSurveyUseCase,
} from "@/modules/survey/server/submissions";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function asOptionalString(formData: FormData, key: string) {
  const value = asString(formData, key);
  return value || null;
}

function asChecked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function manageCourseUrl(courseId: string, params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
  }

  const suffix = search.toString();
  return suffix ? `/courses/${courseId}/manage?${suffix}` : `/courses/${courseId}/manage`;
}

function surveyPageUrl(courseId: string, params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
  }

  const suffix = search.toString();
  return suffix ? `/courses/${courseId}/survey?${suffix}` : `/courses/${courseId}/survey`;
}

function courseItemSurveyBuilderUrl(courseId: string, itemId: string, params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
  }

  const suffix = search.toString();
  return suffix ? `/courses/${courseId}/survey/${itemId}/builder?${suffix}` : `/courses/${courseId}/survey/${itemId}/builder`;
}

function courseItemSurveyPageUrl(courseId: string, itemId: string, params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
  }

  const suffix = search.toString();
  return suffix ? `/courses/${courseId}/survey/${itemId}?${suffix}` : `/courses/${courseId}/survey/${itemId}`;
}

function revalidateCourseSurveyPaths(courseId: string) {
  revalidatePath("/courses");
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/about`);
  revalidatePath(`/courses/${courseId}/feedback`);
  revalidatePath(`/courses/${courseId}/survey`);
  revalidatePath(`/courses/${courseId}/manage`);
}

function revalidateCourseItemSurveyPaths(courseId: string, itemId: string) {
  revalidatePath("/courses");
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/manage`);
  revalidatePath(`/courses/${courseId}/survey/${itemId}`);
  revalidatePath(`/courses/${courseId}/survey/${itemId}/builder`);
}

export async function saveCourseSurveyTemplate(courseId: string, formData: FormData) {
  const access = await requireCourseWorkspaceAccess(courseId);
  if (!access.canEditCourse) {
    redirect("/");
  }

  const questions = parseCourseSurveyQuestionsJson(asString(formData, "questionsJson"));
  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(access.session.user);

  let result;
  try {
    result = await saveCourseSurveyTemplateUseCase({
      courseId,
      actor: { id: actor.id, login: actor.login, name: actor.name },
      audit: {
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
      title: asString(formData, "title"),
      description: asOptionalString(formData, "description"),
      introImageUrl: asOptionalString(formData, "introImageUrl"),
      introImageUploadBusy: formData.get("introImageUrlUploadBusy") === "1",
      isActive: asChecked(formData, "isActive"),
      isRequired: asChecked(formData, "isRequired"),
      saveAsReusableTemplate: formData.get("saveAsReusableTemplate") === "1",
      questions: questions.map((question) => ({
        id: question.id,
        title: question.title,
        type: question.type,
        optionsJson: serializeCourseSurveyQuestionOptions(question.options),
        isRequired: question.isRequired,
      })),
    });
  } catch (error) {
    if (error instanceof SurveyApplicationError) {
      redirect(
        manageCourseUrl(courseId, {
          section: "survey",
          surveyError: error.message,
        }),
      );
    }
    throw error;
  }

  revalidateCourseSurveyPaths(courseId);
  redirect(
    manageCourseUrl(courseId, {
      section: "survey",
      surveySaved: result.reusableTemplateId
        ? "Опрос курса сохранен и добавлен в шаблоны."
        : "Опрос курса сохранен.",
    }),
  );
}

export async function applyReusableCourseSurveyTemplate(courseId: string, formData: FormData) {
  const access = await requireCourseWorkspaceAccess(courseId);
  if (!access.canEditCourse) {
    redirect("/");
  }

  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(access.session.user);

  let result;
  try {
    result = await applyReusableCourseSurveyTemplateUseCase({
      courseId,
      reusableTemplateId: asString(formData, "reusableTemplateId"),
      actor: { id: actor.id, login: actor.login, name: actor.name },
      audit: {
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
    });
  } catch (error) {
    if (error instanceof SurveyApplicationError) {
      redirect(
        manageCourseUrl(courseId, {
          section: "survey",
          surveyError: error.message,
        }),
      );
    }
    throw error;
  }

  revalidateCourseSurveyPaths(courseId);
  redirect(
    manageCourseUrl(courseId, {
      section: "survey",
      surveySaved: `Шаблон «${result.reusableTitle}» применен к опросу курса.`,
    }),
  );
}

export async function saveCourseItemSurveyTemplate(courseId: string, itemId: string, formData: FormData) {
  const access = await requireCourseWorkspaceAccess(courseId);
  if (!access.canEditCourse) {
    redirect("/");
  }

  const questions = parseCourseSurveyQuestionsJson(asString(formData, "questionsJson"));
  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(access.session.user);

  let result;
  try {
    result = await saveCourseItemSurveyTemplateUseCase({
      courseId,
      itemId,
      actor: { id: actor.id, login: actor.login, name: actor.name },
      audit: {
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
      title: asString(formData, "title"),
      description: asOptionalString(formData, "description"),
      introImageUrl: asOptionalString(formData, "introImageUrl"),
      introImageUploadBusy: formData.get("introImageUrlUploadBusy") === "1",
      isActive: asChecked(formData, "isActive"),
      isRequired: asChecked(formData, "isRequired"),
      saveAsReusableTemplate: formData.get("saveAsReusableTemplate") === "1",
      questions: questions.map((question) => ({
        id: question.id,
        title: question.title,
        type: question.type,
        optionsJson: serializeCourseSurveyQuestionOptions(question.options),
        isRequired: question.isRequired,
      })),
    });
  } catch (error) {
    if (error instanceof SurveyApplicationError) {
      if (error.code === "ITEM_NOT_SURVEY") {
        redirect(
          manageCourseUrl(courseId, {
            section: "structure",
            structureError: error.message,
          }),
        );
      }
      redirect(
        courseItemSurveyBuilderUrl(courseId, itemId, {
          surveyError: error.message,
        }),
      );
    }
    throw error;
  }

  revalidateCourseItemSurveyPaths(courseId, itemId);
  redirect(
    courseItemSurveyBuilderUrl(courseId, itemId, {
      surveySaved: result.reusableTemplateId
        ? "Опрос сохранен и добавлен в шаблоны."
        : "Опрос сохранен.",
    }),
  );
}

export async function applyReusableCourseItemSurveyTemplate(courseId: string, itemId: string, formData: FormData) {
  const access = await requireCourseWorkspaceAccess(courseId);
  if (!access.canEditCourse) {
    redirect("/");
  }

  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(access.session.user);

  let result;
  try {
    result = await applyReusableCourseItemSurveyTemplateUseCase({
      courseId,
      itemId,
      reusableTemplateId: asString(formData, "reusableTemplateId"),
      actor: { id: actor.id, login: actor.login, name: actor.name },
      audit: {
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
    });
  } catch (error) {
    if (error instanceof SurveyApplicationError) {
      if (error.code === "ITEM_NOT_SURVEY") {
        redirect(
          manageCourseUrl(courseId, {
            section: "structure",
            structureError: error.message,
          }),
        );
      }
      redirect(
        courseItemSurveyBuilderUrl(courseId, itemId, {
          surveyError: error.message,
        }),
      );
    }
    throw error;
  }

  revalidateCourseItemSurveyPaths(courseId, itemId);
  redirect(
    courseItemSurveyBuilderUrl(courseId, itemId, {
      surveySaved: `Шаблон «${result.reusableTitle}» применен к опросу.`,
    }),
  );
}

export async function submitCourseItemSurvey(courseId: string, itemId: string, formData: FormData) {
  const session = await requireSession();
  const isStudent =
    hasRole(session.user.roles, ROLES.STUDENT) &&
    canTrackMaterialProgress(session.user.roles, session.user.permissions);
  if (!isStudent) {
    redirect(`/courses/${courseId}`);
  }

  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);
  const result = await submitCourseItemSurveyUseCase({
    courseId,
    itemId,
    actor: {
      id: actor.id,
      login: actor.login,
      name: actor.name,
      displayName: session.user.name ?? session.user.email ?? "Ученик",
      email: session.user.email ?? null,
    },
    audit: {
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    },
    now: new Date(),
    getRawAnswer: (questionId) => asString(formData, `question:${questionId}`),
    parseQuestionOptionsJson: parseCourseSurveyQuestionOptionsJson,
  });

  if (result.status === "REDIRECT_HOME") redirect(`/courses/${courseId}`);
  if (result.status === "LOCKED") redirect(`/courses/${courseId}?item=${itemId}`);
  if (result.status === "ALREADY_SUBMITTED") {
    redirect(courseItemSurveyPageUrl(courseId, itemId, { survey: "saved" }));
  }
  if (result.status === "MISSING_ANSWER") {
    throw new Error(`Заполните вопрос «${result.questionTitle}».`);
  }

  if (result.reportRecipient) {
    await enqueueCourseSurveyReportEmails([result.reportRecipient], {
      courseId,
      courseTitle: result.reportPayload.courseTitle,
      surveyTitle: formatCourseSurveyTitle(result.reportPayload.surveyTitle),
      learnerId: result.reportPayload.learnerId,
      learnerName: result.reportPayload.learnerName,
      learnerEmail: result.reportPayload.learnerEmail,
      submittedAt: result.reportPayload.submittedAt,
      manageUrl: `${appBaseUrl()}/courses/${courseId}/survey/${itemId}/builder`,
      answers: result.reportPayload.answers,
    }).catch((error) => {
      console.error("Failed to queue course item survey report email", error);
    });
  }

  revalidateCourseItemSurveyPaths(courseId, itemId);
  redirect(courseItemSurveyPageUrl(courseId, itemId, { survey: "saved" }));
}

export async function submitCourseSurvey(courseId: string, formData: FormData) {
  const session = await requireSession();
  const isStudent =
    hasRole(session.user.roles, ROLES.STUDENT) &&
    canTrackMaterialProgress(session.user.roles, session.user.permissions);
  if (!isStudent) {
    redirect(`/courses/${courseId}`);
  }

  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);
  const result = await submitCourseSurveyUseCase({
    courseId,
    actor: {
      id: actor.id,
      login: actor.login,
      name: actor.name,
      displayName: session.user.name ?? session.user.email ?? "Ученик",
      email: session.user.email ?? null,
    },
    audit: {
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    },
    now: new Date(),
    getRawAnswer: (questionId) => asString(formData, `question:${questionId}`),
    parseQuestionOptionsJson: parseCourseSurveyQuestionOptionsJson,
  });

  if (result.status === "REDIRECT_HOME") redirect(`/courses/${courseId}`);
  if (result.status === "COURSE_NOT_COMPLETED") {
    redirect(surveyPageUrl(courseId, { survey: "locked" }));
  }
  if (result.status === "ALREADY_SUBMITTED") {
    redirect(surveyPageUrl(courseId, { survey: "saved" }));
  }
  if (result.status === "MISSING_ANSWER") {
    throw new Error(`Заполните вопрос «${result.questionTitle}».`);
  }

  if (result.reportRecipient) {
    await enqueueCourseSurveyReportEmails([result.reportRecipient], {
      courseId,
      courseTitle: result.reportPayload.courseTitle,
      surveyTitle: formatCourseSurveyTitle(result.reportPayload.surveyTitle),
      learnerId: result.reportPayload.learnerId,
      learnerName: result.reportPayload.learnerName,
      learnerEmail: result.reportPayload.learnerEmail,
      submittedAt: result.reportPayload.submittedAt,
      manageUrl: `${appBaseUrl()}/courses/${courseId}/manage?section=survey`,
      answers: result.reportPayload.answers,
    }).catch((error) => {
      console.error("Failed to queue course survey report email", error);
    });
  }

  revalidateCourseSurveyPaths(courseId);
  redirect(surveyPageUrl(courseId, { survey: "saved" }));
}
