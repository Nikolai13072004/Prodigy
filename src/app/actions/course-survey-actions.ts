"use server";

import { appBaseUrl } from "@/lib/app-base-url";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireCourseWorkspaceAccess, requireSession } from "@/lib/auth-guards";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import { isUserAssignedToCourse } from "@/lib/access";
import { buildCourseOutline } from "@/lib/course-navigation";
import { getCourseProgress } from "@/lib/course-progress";
import { enqueueCourseSurveyReportEmails } from "@/lib/email/queue";
import {
  formatCourseSurveyTitle,
  parseCourseSurveyQuestionOptionsJson,
  parseCourseSurveyQuestionsJson,
  serializeCourseSurveyQuestionOptions,
} from "@/lib/course-surveys";
import { canTrackMaterialProgress, ROLES, hasRole } from "@/lib/roles";
import { planSurveyAnswers } from "@/modules/survey/domain/survey-answers";
import { planSurveyQuestionSync } from "@/modules/survey/domain/survey-question-sync";

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

async function markCourseContentChanged(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true },
  });

  if (!course || course.status !== "PUBLISHED") return;

  await prisma.course.update({
    where: { id: courseId },
    data: { hasUnpublishedChanges: true },
  });
}

export async function saveCourseSurveyTemplate(courseId: string, formData: FormData) {
  const access = await requireCourseWorkspaceAccess(courseId);
  if (!access.canEditCourse) {
    redirect("/");
  }

  const title = formatCourseSurveyTitle(asString(formData, "title"));
  const description = asOptionalString(formData, "description");
  const introImageUrl = asOptionalString(formData, "introImageUrl");
  const introImageUploadBusy = formData.get("introImageUrlUploadBusy") === "1";
  const isActive = asChecked(formData, "isActive");
  const isRequired = asChecked(formData, "isRequired");
  const saveAsReusableTemplate = formData.get("saveAsReusableTemplate") === "1";
  const questions = parseCourseSurveyQuestionsJson(asString(formData, "questionsJson"));

  if (introImageUploadBusy) {
    redirect(
      manageCourseUrl(courseId, {
        section: "survey",
        surveyError: "Дождитесь окончания загрузки фонового изображения и сохраните опрос еще раз.",
      })
    );
  }

  if (questions.length === 0) {
    redirect(
      manageCourseUrl(courseId, {
        section: "survey",
        surveyError: "Добавьте хотя бы один вопрос в опрос.",
      })
    );
  }

  const existingTemplate = await prisma.courseSurveyTemplate.findUnique({
    where: { courseId },
    include: {
      questions: {
        select: { id: true },
      },
    },
  });

  const result = await prisma.$transaction(async (tx) => {
    const template = existingTemplate
      ? await tx.courseSurveyTemplate.update({
          where: { id: existingTemplate.id },
          data: {
            title,
            description,
            introImageUrl,
            isActive,
            isRequired,
          },
        })
      : await tx.courseSurveyTemplate.create({
          data: {
            courseId,
            title,
            description,
            introImageUrl,
            isActive,
            isRequired,
          },
        });

    const sync = planSurveyQuestionSync(
      existingTemplate?.questions.map((question) => question.id) ?? [],
      questions,
    );

    for (const op of sync.ops) {
      const question = questions[op.index];
      const data = {
        title: question.title,
        type: question.type,
        optionsJson: serializeCourseSurveyQuestionOptions(question.options),
        isRequired: question.isRequired,
        orderIndex: op.index,
      };
      if (op.kind === "update") {
        await tx.courseSurveyQuestion.update({ where: { id: op.id }, data });
      } else {
        await tx.courseSurveyQuestion.create({ data: { templateId: template.id, ...data } });
      }
    }

    if (sync.toDeleteIds.length > 0) {
      await tx.courseSurveyQuestion.deleteMany({
        where: {
          templateId: template.id,
          id: { in: sync.toDeleteIds },
        },
      });
    }

    const reusableTemplate = saveAsReusableTemplate
      ? await tx.reusableCourseSurveyTemplate.create({
          data: {
            title,
            description,
            introImageUrl,
            isRequired,
            sourceCourseId: courseId,
            createdById: access.session.user.id,
            questions: {
              create: questions.map((question, index) => ({
                title: question.title,
                type: question.type,
                optionsJson: serializeCourseSurveyQuestionOptions(question.options),
                isRequired: question.isRequired,
                orderIndex: index,
              })),
            },
          },
        })
      : null;

    return { template, reusableTemplate };
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(access.session.user),
    action: existingTemplate ? "course_survey:update" : "course_survey:create",
    objectType: "course_survey",
    objectId: result.template.id,
    objectLabel: title,
    metadata: {
      courseId,
      isActive,
      isRequired,
      hasIntroImage: Boolean(introImageUrl),
      questionsCount: questions.length,
      savedAsReusableTemplate: Boolean(result.reusableTemplate),
    },
  });

  if (result.reusableTemplate) {
    await recordAuditEvent({
      actor: auditActorFromSessionUser(access.session.user),
      action: "course_survey_template:create",
      objectType: "course_survey_template",
      objectId: result.reusableTemplate.id,
      objectLabel: title,
      metadata: {
        courseId,
        sourceCourseId: courseId,
        hasIntroImage: Boolean(introImageUrl),
        questionsCount: questions.length,
      },
    });
  }

  revalidateCourseSurveyPaths(courseId);

  redirect(
    manageCourseUrl(courseId, {
      section: "survey",
      surveySaved: result.reusableTemplate
        ? "Опрос курса сохранен и добавлен в шаблоны."
        : "Опрос курса сохранен.",
    })
  );
}

export async function applyReusableCourseSurveyTemplate(courseId: string, formData: FormData) {
  const access = await requireCourseWorkspaceAccess(courseId);
  if (!access.canEditCourse) {
    redirect("/");
  }

  const reusableTemplateId = asString(formData, "reusableTemplateId");
  if (!reusableTemplateId) {
    redirect(
      manageCourseUrl(courseId, {
        section: "survey",
        surveyError: "Выберите шаблон опроса.",
      })
    );
  }

  const reusableTemplate = await prisma.reusableCourseSurveyTemplate.findUnique({
    where: { id: reusableTemplateId },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  if (!reusableTemplate || reusableTemplate.questions.length === 0) {
    redirect(
      manageCourseUrl(courseId, {
        section: "survey",
        surveyError: "Шаблон опроса не найден или не содержит вопросов.",
      })
    );
  }

  const existingTemplate = await prisma.courseSurveyTemplate.findUnique({
    where: { courseId },
    select: { id: true },
  });

  const savedTemplate = await prisma.$transaction(async (tx) => {
    const reusableTemplateTitle = formatCourseSurveyTitle(reusableTemplate.title);
    const template = existingTemplate
      ? await tx.courseSurveyTemplate.update({
          where: { id: existingTemplate.id },
          data: {
            title: reusableTemplateTitle,
            description: reusableTemplate.description,
            introImageUrl: reusableTemplate.introImageUrl,
            isActive: true,
            isRequired: reusableTemplate.isRequired,
          },
        })
      : await tx.courseSurveyTemplate.create({
          data: {
            courseId,
            title: reusableTemplateTitle,
            description: reusableTemplate.description,
            introImageUrl: reusableTemplate.introImageUrl,
            isActive: true,
            isRequired: reusableTemplate.isRequired,
          },
        });

    await tx.courseSurveyQuestion.deleteMany({
      where: { templateId: template.id },
    });

    await tx.courseSurveyQuestion.createMany({
      data: reusableTemplate.questions.map((question, index) => ({
        templateId: template.id,
        title: question.title,
        type: question.type,
        optionsJson: question.optionsJson,
        isRequired: question.isRequired,
        orderIndex: index,
      })),
    });

    return template;
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(access.session.user),
    action: "course_survey_template:apply",
    objectType: "course_survey_template",
    objectId: reusableTemplate.id,
    objectLabel: formatCourseSurveyTitle(reusableTemplate.title),
    metadata: {
      courseId,
      targetSurveyTemplateId: savedTemplate.id,
      hasIntroImage: Boolean(reusableTemplate.introImageUrl),
      questionsCount: reusableTemplate.questions.length,
    },
  });

  revalidateCourseSurveyPaths(courseId);

  redirect(
    manageCourseUrl(courseId, {
      section: "survey",
      surveySaved: `Шаблон «${formatCourseSurveyTitle(reusableTemplate.title)}» применен к опросу курса.`,
    })
  );
}

export async function saveCourseItemSurveyTemplate(courseId: string, itemId: string, formData: FormData) {
  const access = await requireCourseWorkspaceAccess(courseId);
  if (!access.canEditCourse) {
    redirect("/");
  }

  const title = formatCourseSurveyTitle(asString(formData, "title"));
  const description = asOptionalString(formData, "description");
  const introImageUrl = asOptionalString(formData, "introImageUrl");
  const introImageUploadBusy = formData.get("introImageUrlUploadBusy") === "1";
  const isActive = asChecked(formData, "isActive");
  const isRequired = asChecked(formData, "isRequired");
  const saveAsReusableTemplate = formData.get("saveAsReusableTemplate") === "1";
  const questions = parseCourseSurveyQuestionsJson(asString(formData, "questionsJson"));

  if (introImageUploadBusy) {
    redirect(
      courseItemSurveyBuilderUrl(courseId, itemId, {
        surveyError: "Дождитесь окончания загрузки фонового изображения и сохраните опрос еще раз.",
      })
    );
  }

  if (questions.length === 0) {
    redirect(
      courseItemSurveyBuilderUrl(courseId, itemId, {
        surveyError: "Добавьте хотя бы один вопрос в опрос.",
      })
    );
  }

  const item = await prisma.courseItem.findFirst({
    where: { id: itemId, courseId, archivedAt: null },
    select: { id: true, type: true },
  });

  if (!item || item.type !== "SURVEY") {
    redirect(manageCourseUrl(courseId, { section: "structure", structureError: "Опрос не найден." }));
  }

  const existingTemplate = await prisma.courseItemSurveyTemplate.findUnique({
    where: { courseItemId: itemId },
    include: {
      questions: {
        select: { id: true },
      },
    },
  });

  const result = await prisma.$transaction(async (tx) => {
    await tx.courseItem.update({
      where: { id: itemId },
      data: {
        title,
        isRequired,
        content: null,
        fileUrl: null,
        totalSlides: null,
      },
    });

    const template = existingTemplate
      ? await tx.courseItemSurveyTemplate.update({
          where: { id: existingTemplate.id },
          data: {
            title,
            description,
            introImageUrl,
            isActive,
            isRequired,
          },
        })
      : await tx.courseItemSurveyTemplate.create({
          data: {
            courseId,
            courseItemId: itemId,
            title,
            description,
            introImageUrl,
            isActive,
            isRequired,
          },
        });

    const sync = planSurveyQuestionSync(
      existingTemplate?.questions.map((question) => question.id) ?? [],
      questions,
    );

    for (const op of sync.ops) {
      const question = questions[op.index];
      const data = {
        title: question.title,
        type: question.type,
        optionsJson: serializeCourseSurveyQuestionOptions(question.options),
        isRequired: question.isRequired,
        orderIndex: op.index,
      };
      if (op.kind === "update") {
        await tx.courseItemSurveyQuestion.update({ where: { id: op.id }, data });
      } else {
        await tx.courseItemSurveyQuestion.create({ data: { templateId: template.id, ...data } });
      }
    }

    if (sync.toDeleteIds.length > 0) {
      await tx.courseItemSurveyQuestion.deleteMany({
        where: {
          templateId: template.id,
          id: { in: sync.toDeleteIds },
        },
      });
    }

    const reusableTemplate = saveAsReusableTemplate
      ? await tx.reusableCourseSurveyTemplate.create({
          data: {
            title,
            description,
            introImageUrl,
            isRequired,
            sourceCourseId: courseId,
            createdById: access.session.user.id,
            questions: {
              create: questions.map((question, index) => ({
                title: question.title,
                type: question.type,
                optionsJson: serializeCourseSurveyQuestionOptions(question.options),
                isRequired: question.isRequired,
                orderIndex: index,
              })),
            },
          },
        })
      : null;

    return { template, reusableTemplate };
  });

  await markCourseContentChanged(courseId);

  await recordAuditEvent({
    actor: auditActorFromSessionUser(access.session.user),
    action: existingTemplate ? "course_item_survey:update" : "course_item_survey:create",
    objectType: "course_item_survey",
    objectId: result.template.id,
    objectLabel: title,
    metadata: {
      courseId,
      courseItemId: itemId,
      isActive,
      isRequired,
      hasIntroImage: Boolean(introImageUrl),
      questionsCount: questions.length,
      savedAsReusableTemplate: Boolean(result.reusableTemplate),
    },
  });

  if (result.reusableTemplate) {
    await recordAuditEvent({
      actor: auditActorFromSessionUser(access.session.user),
      action: "course_survey_template:create",
      objectType: "course_survey_template",
      objectId: result.reusableTemplate.id,
      objectLabel: title,
      metadata: {
        courseId,
        sourceCourseId: courseId,
        courseItemId: itemId,
        hasIntroImage: Boolean(introImageUrl),
        questionsCount: questions.length,
      },
    });
  }

  revalidateCourseItemSurveyPaths(courseId, itemId);

  redirect(
    courseItemSurveyBuilderUrl(courseId, itemId, {
      surveySaved: result.reusableTemplate
        ? "Опрос сохранен и добавлен в шаблоны."
        : "Опрос сохранен.",
    })
  );
}

export async function applyReusableCourseItemSurveyTemplate(courseId: string, itemId: string, formData: FormData) {
  const access = await requireCourseWorkspaceAccess(courseId);
  if (!access.canEditCourse) {
    redirect("/");
  }

  const reusableTemplateId = asString(formData, "reusableTemplateId");
  if (!reusableTemplateId) {
    redirect(
      courseItemSurveyBuilderUrl(courseId, itemId, {
        surveyError: "Выберите шаблон опроса.",
      })
    );
  }

  const [item, reusableTemplate, existingTemplate] = await Promise.all([
    prisma.courseItem.findFirst({
      where: { id: itemId, courseId, archivedAt: null },
      select: { id: true, type: true },
    }),
    prisma.reusableCourseSurveyTemplate.findUnique({
      where: { id: reusableTemplateId },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" },
        },
      },
    }),
    prisma.courseItemSurveyTemplate.findUnique({
      where: { courseItemId: itemId },
      select: { id: true },
    }),
  ]);

  if (!item || item.type !== "SURVEY") {
    redirect(manageCourseUrl(courseId, { section: "structure", structureError: "Опрос не найден." }));
  }

  if (!reusableTemplate || reusableTemplate.questions.length === 0) {
    redirect(
      courseItemSurveyBuilderUrl(courseId, itemId, {
        surveyError: "Шаблон опроса не найден или не содержит вопросов.",
      })
    );
  }

  const savedTemplate = await prisma.$transaction(async (tx) => {
    const reusableTemplateTitle = formatCourseSurveyTitle(reusableTemplate.title);
    await tx.courseItem.update({
      where: { id: itemId },
      data: {
        title: reusableTemplateTitle,
        isRequired: reusableTemplate.isRequired,
        content: null,
        fileUrl: null,
        totalSlides: null,
      },
    });

    const template = existingTemplate
      ? await tx.courseItemSurveyTemplate.update({
          where: { id: existingTemplate.id },
          data: {
            title: reusableTemplateTitle,
            description: reusableTemplate.description,
            introImageUrl: reusableTemplate.introImageUrl,
            isActive: true,
            isRequired: reusableTemplate.isRequired,
          },
        })
      : await tx.courseItemSurveyTemplate.create({
          data: {
            courseId,
            courseItemId: itemId,
            title: reusableTemplateTitle,
            description: reusableTemplate.description,
            introImageUrl: reusableTemplate.introImageUrl,
            isActive: true,
            isRequired: reusableTemplate.isRequired,
          },
        });

    await tx.courseItemSurveyQuestion.deleteMany({
      where: { templateId: template.id },
    });

    await tx.courseItemSurveyQuestion.createMany({
      data: reusableTemplate.questions.map((question, index) => ({
        templateId: template.id,
        title: question.title,
        type: question.type,
        optionsJson: question.optionsJson,
        isRequired: question.isRequired,
        orderIndex: index,
      })),
    });

    return template;
  });

  await markCourseContentChanged(courseId);

  await recordAuditEvent({
    actor: auditActorFromSessionUser(access.session.user),
    action: "course_survey_template:apply",
    objectType: "course_survey_template",
    objectId: reusableTemplate.id,
    objectLabel: formatCourseSurveyTitle(reusableTemplate.title),
    metadata: {
      courseId,
      courseItemId: itemId,
      targetSurveyTemplateId: savedTemplate.id,
      hasIntroImage: Boolean(reusableTemplate.introImageUrl),
      questionsCount: reusableTemplate.questions.length,
    },
  });

  revalidateCourseItemSurveyPaths(courseId, itemId);

  redirect(
    courseItemSurveyBuilderUrl(courseId, itemId, {
      surveySaved: `Шаблон «${formatCourseSurveyTitle(reusableTemplate.title)}» применен к опросу.`,
    })
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

  const allowed = await isUserAssignedToCourse(session.user.id, courseId);
  if (!allowed) {
    redirect(`/courses/${courseId}`);
  }

  const [course, learner] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        status: true,
        navigationMode: true,
        quizGateMode: true,
        owner: {
          select: {
            name: true,
            email: true,
            firstName: true,
          },
        },
        items: {
          where: { archivedAt: null },
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            moduleId: true,
            orderIndex: true,
            type: true,
            title: true,
            content: true,
            fileUrl: true,
            totalSlides: true,
            isRequired: true,
            module: {
              select: {
                id: true,
                title: true,
                description: true,
                orderIndex: true,
              },
            },
            views: {
              where: { userId: session.user.id },
              select: {
                progressPercent: true,
                viewedAt: true,
              },
              take: 1,
            },
            quiz: {
              select: {
                id: true,
                description: true,
                maxAttempts: true,
                minCorrectAnswers: true,
                lockMaterialsOnStart: true,
                questions: {
                  where: { archivedAt: null },
                  select: { id: true },
                },
                attempts: {
                  where: { userId: session.user.id },
                  select: {
                    id: true,
                    outcome: true,
                    correctAnswers: true,
                    attemptNumber: true,
                    score: true,
                    maxScore: true,
                    completedAt: true,
                  },
                },
              },
            },
            surveyTemplate: {
              include: {
                questions: {
                  orderBy: { orderIndex: "asc" },
                },
                responses: {
                  where: { userId: session.user.id },
                  take: 1,
                },
              },
            },
          },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        login: true,
      },
    }),
  ]);

  if (!course || course.status !== "PUBLISHED") {
    redirect(`/courses/${courseId}`);
  }

  const surveyItem = course.items.find((item) => item.id === itemId) ?? null;
  if (!surveyItem || surveyItem.type !== "SURVEY" || !surveyItem.surveyTemplate?.isActive) {
    redirect(`/courses/${courseId}`);
  }

  const outline = buildCourseOutline(
    course.items.map((item) => ({
      ...item,
      quiz: item.quiz
        ? {
            ...item.quiz,
            attempts: item.quiz.attempts,
          }
        : null,
    })),
    course.navigationMode === "SEQUENTIAL" ? "SEQUENTIAL" : "FREE",
    {
      lockQuizzesUntilPreviousRequiredComplete: true,
      lockMaterialsWhenQuizStarted: true,
      quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
    }
  );
  const surveyEntry = outline.find((item) => item.id === itemId) ?? null;
  if (surveyEntry?.isLocked) {
    redirect(`/courses/${courseId}?item=${itemId}`);
  }

  const existingResponse = await prisma.courseItemSurveyResponse.findUnique({
    where: {
      courseItemId_userId: {
        courseItemId: itemId,
        userId: session.user.id,
      },
    },
    select: { id: true },
  });

  if (existingResponse) {
    redirect(courseItemSurveyPageUrl(courseId, itemId, { survey: "saved" }));
  }

  const answerPlan = planSurveyAnswers(
    surveyItem.surveyTemplate.questions,
    (questionId) => asString(formData, `question:${questionId}`),
    parseCourseSurveyQuestionOptionsJson,
  );
  if (!answerPlan.ok) {
    throw new Error(`Заполните вопрос «${answerPlan.missingQuestionTitle}».`);
  }
  const answers = answerPlan.answers;
  const reportAnswers = answerPlan.reportAnswers;
  const submittedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const response = await tx.courseItemSurveyResponse.create({
      data: {
        templateId: surveyItem.surveyTemplate!.id,
        courseId,
        courseItemId: itemId,
        userId: session.user.id,
      },
    });

    await tx.courseItemSurveyAnswer.deleteMany({
      where: { responseId: response.id },
    });

    if (answers.length > 0) {
      await tx.courseItemSurveyAnswer.createMany({
        data: answers.map((answer) => ({
          responseId: response.id,
          questionId: answer.questionId,
          ratingValue: answer.ratingValue,
          textValue: answer.textValue,
        })),
      });
    }

    await tx.courseItemView.upsert({
      where: {
        courseItemId_userId: {
          courseItemId: itemId,
          userId: session.user.id,
        },
      },
      create: {
        courseItemId: itemId,
        userId: session.user.id,
        progressPercent: 100,
        maxPageSeen: 1,
        totalPages: 1,
        viewedAt: submittedAt,
      },
      update: {
        progressPercent: 100,
        maxPageSeen: 1,
        totalPages: 1,
        viewedAt: submittedAt,
      },
    });
  });

  if (course.owner?.email) {
    await enqueueCourseSurveyReportEmails(
      [
        {
          email: course.owner.email,
          name: course.owner.name,
          firstName: course.owner.firstName,
        },
      ],
      {
        courseId,
        courseTitle: course.title,
        surveyTitle: formatCourseSurveyTitle(surveyItem.surveyTemplate.title),
        learnerId: session.user.id,
        learnerName: learner?.name ?? session.user.name ?? session.user.email ?? "Ученик",
        learnerEmail: learner?.email ?? null,
        submittedAt,
        manageUrl: `${appBaseUrl()}/courses/${courseId}/survey/${itemId}/builder`,
        answers: reportAnswers,
      }
    ).catch((error) => {
      console.error("Failed to queue course item survey report email", error);
    });
  }

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "course_item_survey:submit",
    objectType: "course_item_survey_response",
    objectId: `${itemId}:${session.user.id}`,
    objectLabel: surveyItem.title,
    metadata: {
      courseId,
      courseItemId: itemId,
      templateId: surveyItem.surveyTemplate.id,
      answersCount: answers.length,
      reportEmailQueued: Boolean(course.owner?.email),
    },
  });

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

  const allowed = await isUserAssignedToCourse(session.user.id, courseId);
  if (!allowed) {
    redirect(`/courses/${courseId}`);
  }

  const [course, learner] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        quizGateMode: true,
        owner: {
          select: {
            name: true,
            email: true,
            firstName: true,
          },
        },
        items: {
          where: { archivedAt: null },
          select: {
            id: true,
            type: true,
            title: true,
            isRequired: true,
            views: {
              where: { userId: session.user.id },
              select: { progressPercent: true },
              take: 1,
            },
            quiz: {
              select: {
                maxAttempts: true,
                minCorrectAnswers: true,
                attempts: {
                  where: { userId: session.user.id },
                  select: {
                    outcome: true,
                    correctAnswers: true,
                    attemptNumber: true,
                    score: true,
                    completedAt: true,
                  },
                },
              },
            },
          },
          orderBy: { orderIndex: "asc" },
        },
        surveyTemplate: {
          include: {
            questions: {
              orderBy: { orderIndex: "asc" },
            },
          },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        login: true,
      },
    }),
  ]);

  if (!course || !course.surveyTemplate || !course.surveyTemplate.isActive) {
    redirect(`/courses/${courseId}`);
  }

  const progress = getCourseProgress({
    quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
    items: course.items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      isRequired: item.isRequired,
      viewed: item.type === "QUIZ" ? false : item.views.length > 0,
      materialProgress: item.type === "QUIZ" ? 0 : item.views[0]?.progressPercent ?? 0,
      quiz: item.quiz,
    })),
  });

  if (!progress.isCompleted) {
    redirect(surveyPageUrl(courseId, { survey: "locked" }));
  }

  const existingResponse = await prisma.courseSurveyResponse.findUnique({
    where: {
      courseId_userId: {
        courseId,
        userId: session.user.id,
      },
    },
    select: { id: true },
  });

  if (existingResponse) {
    redirect(surveyPageUrl(courseId, { survey: "saved" }));
  }

  const answerPlan = planSurveyAnswers(
    course.surveyTemplate.questions,
    (questionId) => asString(formData, `question:${questionId}`),
    parseCourseSurveyQuestionOptionsJson,
  );
  if (!answerPlan.ok) {
    throw new Error(`Заполните вопрос «${answerPlan.missingQuestionTitle}».`);
  }
  const answers = answerPlan.answers;
  const reportAnswers = answerPlan.reportAnswers;
  const submittedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const response = await tx.courseSurveyResponse.create({
      data: {
        templateId: course.surveyTemplate!.id,
        courseId,
        userId: session.user.id,
      },
    });

    await tx.courseSurveyAnswer.deleteMany({
      where: { responseId: response.id },
    });

    if (answers.length > 0) {
      await tx.courseSurveyAnswer.createMany({
        data: answers.map((answer) => ({
          responseId: response.id,
          questionId: answer.questionId,
          ratingValue: answer.ratingValue,
          textValue: answer.textValue,
        })),
      });
    }
  });

  if (course.owner?.email) {
    await enqueueCourseSurveyReportEmails(
      [
        {
          email: course.owner.email,
          name: course.owner.name,
          firstName: course.owner.firstName,
        },
      ],
      {
        courseId,
        courseTitle: course.title,
        surveyTitle: formatCourseSurveyTitle(course.surveyTemplate.title),
        learnerId: session.user.id,
        learnerName: learner?.name ?? session.user.name ?? session.user.email ?? "Ученик",
        learnerEmail: learner?.email ?? null,
        submittedAt,
        manageUrl: `${appBaseUrl()}/courses/${courseId}/manage?section=survey`,
        answers: reportAnswers,
      }
    ).catch((error) => {
      console.error("Failed to queue course survey report email", error);
    });
  }

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "course_survey:submit",
    objectType: "course_survey_response",
    objectId: `${courseId}:${session.user.id}`,
    objectLabel: course.title,
    metadata: {
      courseId,
      templateId: course.surveyTemplate.id,
      answersCount: answers.length,
      reportEmailQueued: Boolean(course.owner?.email),
    },
  });

  revalidateCourseSurveyPaths(courseId);
  redirect(surveyPageUrl(courseId, { survey: "saved" }));
}
