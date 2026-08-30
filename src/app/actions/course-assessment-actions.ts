"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireManageCourse, requireSession } from "@/lib/auth-guards";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import { canManageCourse, canOpenQuizPage } from "@/lib/access";
import { normalizePresentationViewMode } from "@/lib/constants";
import { getCourseManualReviewStatusParam } from "@/lib/course-manual-reviews";
import { isPublishedSnapshotActive, parsePublishedCourseSnapshot } from "@/lib/course-content";
import { buildCourseOutline } from "@/lib/course-navigation";
import { getManualReviewQuestions, parseAttemptAnswers as parseAttemptAnswersFromJson, parseManualReviewData, parseQuestionSnapshot } from "@/lib/quiz-manual-review";
import { canTrackLearningProgress } from "@/lib/roles";
import { enqueueQuizReviewedEmails } from "@/lib/email/queue";
import { issueCertificateIfCompleted } from "@/modules/certification/server/issue-certificate-if-completed";
import { getAssessmentRetryAvailableAt, prepareAssessmentQuestions } from "@/modules/assessment/domain/delivery";
import { isAssessmentTimeLimitExpired } from "@/modules/assessment/domain/assessment";
import { normalizeFileAnswer } from "@/modules/assessment/domain/file-answer";
import { reviewAssessmentAttempt } from "@/modules/assessment/server/review-assessment-attempt";
import { saveAssessmentDraft } from "@/modules/assessment/server/save-assessment-draft";
import { startAssessmentAttempt } from "@/modules/assessment/server/start-assessment-attempt";
import { submitAssessmentAttempt } from "@/modules/assessment/server/submit-assessment-attempt";
import { asOptionalString, asString } from "./course-action-input";

async function loadQuizDeliveryContext(args: {
  quizId: string;
  courseId: string;
  user: {
    id: string;
    roles: string[];
    permissions?: string[] | null;
  };
}) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: args.quizId },
    include: {
      courseItem: {
        include: {
          course: {
            select: {
              id: true,
              ownerId: true,
              status: true,
              hasUnpublishedChanges: true,
              publishedSnapshotJson: true,
              navigationMode: true,
              quizGateMode: true,
            },
          },
        },
      },
      questions: {
        where: { archivedAt: null },
        orderBy: { orderIndex: "asc" },
      },
      attempts: {
        where: { userId: args.user.id },
        orderBy: { attemptNumber: "asc" },
      },
    },
  });

  if (!quiz || quiz.courseItem.courseId !== args.courseId) {
    throw new Error("Тест не найден");
  }

  const shouldUsePublishedSnapshot =
    quiz.courseItem.course.status === "PUBLISHED" &&
    quiz.courseItem.course.hasUnpublishedChanges &&
    !canManageCourse(args.user.roles, args.user.id, {
      ownerId: quiz.courseItem.course.ownerId,
    });
  const publishedSnapshot = shouldUsePublishedSnapshot
    ? parsePublishedCourseSnapshot(quiz.courseItem.course.publishedSnapshotJson)
    : null;
  const snapshotItem = publishedSnapshot?.items.find((item) => item.quiz?.id === args.quizId) ?? null;

  return {
    quiz,
    questions: snapshotItem?.quiz?.questions ?? quiz.questions,
    title: snapshotItem?.title ?? quiz.courseItem.title,
    description: snapshotItem?.quiz?.description ?? quiz.description,
    usingPublishedSnapshot: Boolean(snapshotItem),
  };
}

async function ensureQuizUnlockedByRequiredLessons(args: {
  courseId: string;
  quizId: string;
  quizCourseItemId: string;
  user: {
    id: string;
    roles: string[];
    permissions?: string[] | null;
  };
  course: {
    id: string;
    ownerId: string | null;
    status: string;
    hasUnpublishedChanges: boolean;
    publishedSnapshotJson: string | null;
    navigationMode: string;
    quizGateMode: string;
  };
}) {
  if (!canTrackLearningProgress(args.user.roles, args.user.permissions)) return;

  const publishedSnapshot =
    isPublishedSnapshotActive(args.course) &&
    !canManageCourse(args.user.roles, args.user.id, {
      ownerId: args.course.ownerId,
    })
      ? parsePublishedCourseSnapshot(args.course.publishedSnapshotJson)
      : null;

  const courseItems = await prisma.courseItem.findMany({
    where: publishedSnapshot
      ? {
          id: {
            in: publishedSnapshot.items.map((item) => item.id),
          },
        }
      : { courseId: args.courseId, archivedAt: null },
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
      presentationViewMode: true,
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
        where: { userId: args.user.id },
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
	          timeLimitMinutes: true,
	          shuffleQuestions: true,
	          shuffleAnswers: true,
	          lockMaterialsOnStart: true,
          questions: {
            where: { archivedAt: null },
            select: {
              id: true,
            },
          },
          attempts: {
            where: { userId: args.user.id },
            orderBy: { attemptNumber: "asc" },
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
    },
  });

  const displayCourseItems = publishedSnapshot
    ? publishedSnapshot.items.map((item) => {
        const liveItem = courseItems.find((candidate) => candidate.id === item.id);
        return {
          id: item.id,
          moduleId: item.moduleId,
          orderIndex: item.orderIndex,
          type: item.type,
          title: item.title,
          content: item.content,
          fileUrl: item.fileUrl,
          totalSlides: item.totalSlides,
          presentationViewMode: normalizePresentationViewMode(item.presentationViewMode),
          isRequired: item.isRequired,
          module:
            item.moduleId ? publishedSnapshot.modules.find((module) => module.id === item.moduleId) ?? null : null,
          views: liveItem?.views ?? [],
          quiz: item.quiz
            ? {
                id: item.quiz.id,
                description: item.quiz.description,
                maxAttempts: item.quiz.maxAttempts,
                minCorrectAnswers: item.quiz.minCorrectAnswers,
                lockMaterialsOnStart: item.quiz.lockMaterialsOnStart,
                questions: item.quiz.questions.map((question) => ({ id: question.id })),
                attempts: liveItem?.quiz?.attempts ?? [],
              }
            : null,
        };
      })
    : courseItems.map((item) => ({
        ...item,
        quiz: item.quiz ? { ...item.quiz } : null,
      }));

  const navigationMode =
    (publishedSnapshot?.navigationMode ?? args.course.navigationMode) === "SEQUENTIAL" ? "SEQUENTIAL" : "FREE";
  const quizGateMode =
    (publishedSnapshot?.quizGateMode ?? args.course.quizGateMode) === "PASSED" ? "PASSED" : "RESOLVED";
  const outline = buildCourseOutline(displayCourseItems, navigationMode, {
    lockQuizzesUntilPreviousRequiredComplete: true,
    quizGateMode,
  });
  const quizEntry = outline.find((item) => item.id === args.quizCourseItemId) ?? null;

  if (quizEntry?.isLocked) {
    throw new Error("Тест станет доступен после завершения предыдущего обязательного материала");
  }
}

function readAnswersFromFormData(
  questions: { id: string; type: string; config: string }[],
  formData: FormData
) {
  const answers: Record<string, unknown> = {};
  for (const question of questions) {
    const config = parseQuestionConfig<Record<string, unknown>>(question.config, {});
    if (question.type === "MATCHING") {
      const leftCount = Array.isArray(config.left) ? config.left.length : 0;
      answers[question.id] = Array.from({ length: leftCount }, (_, index) => {
        const value = formData.get(`q_${question.id}_${index}`);
        return value === null ? "" : String(value);
      });
      continue;
    }

    if (question.type === "FILE") {
      const value = formData.get(`q_${question.id}`);
      answers[question.id] = normalizeFileAnswer(
        value === null ? "" : String(value),
        {
          allowedExtensions: Array.isArray(config.allowedExtensions)
            ? config.allowedExtensions.map(String)
            : [],
          maxFileSizeMb:
            typeof config.maxFileSizeMb === "number"
              ? config.maxFileSizeMb
              : Number(config.maxFileSizeMb ?? NaN),
        }
      );
      continue;
    }

    const value = formData.get(`q_${question.id}`);
    answers[question.id] = value === null ? "" : String(value);
  }
  return answers;
}

function getQuizAttemptDeliveryQuestions<T extends {
  id: string;
  orderIndex: number;
  type: string;
  prompt: string;
  config: string;
  points: number;
}>(
  draftAttempt: { questionSnapshot: string | null } | null,
  fallbackQuestions: T[]
) {
  const snapshot = draftAttempt ? parseQuestionSnapshot(draftAttempt.questionSnapshot) : [];
  return snapshot.length > 0 ? snapshot : fallbackQuestions;
}

function normalizeSecurityEventsJson(formData: FormData) {
  const raw = asString(formData, "securityEventsJson");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const events = parsed
      .map((event) => {
        if (!event || typeof event !== "object" || Array.isArray(event)) return null;
        const type = "type" in event ? String(event.type ?? "").trim().slice(0, 80) : "";
        const atRaw = "at" in event ? String(event.at ?? "").trim() : "";
        const at = new Date(atRaw);
        if (!type || Number.isNaN(at.getTime())) return null;
        return {
          type,
          at: at.toISOString(),
        };
      })
      .filter((event): event is { type: string; at: string } => Boolean(event))
      .slice(-50);
    return events.length > 0 ? JSON.stringify(events) : null;
  } catch {
    return null;
  }
}

function hasAnyFilledAnswer(answers: Record<string, unknown>) {
  return Object.values(answers).some((value) => {
    if (Array.isArray(value)) {
      return value.some((entry) => String(entry ?? "").trim() !== "");
    }
    return String(value ?? "").trim() !== "";
  });
}

function parseQuestionConfig<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseManualReviewAccepted(formData: FormData, questionId: string) {
  return asString(formData, `reviewAccepted_${questionId}`) !== "rejected";
}

function parseManualReviewPoints(formData: FormData, questionId: string, maxPoints: number) {
  const raw = Number.parseInt(asString(formData, `reviewPoints_${questionId}`), 10);
  if (!Number.isFinite(raw)) {
    throw new Error("Укажите баллы для каждого вопроса с ручной проверкой");
  }

  return Math.max(0, Math.min(maxPoints, raw));
}

export async function saveQuizAttemptProgress(
  quizId: string,
  courseId: string,
  formData: FormData
) {
  const session = await requireSession();

  const { quiz, questions } = await loadQuizDeliveryContext({
    quizId,
    courseId,
    user: session.user,
  });

  const allowed = await canOpenQuizPage(
    session.user.id,
    session.user.roles,
    quiz,
    session.user.permissions
  );
  if (!allowed) throw new Error("Нет доступа к тесту");
  await ensureQuizUnlockedByRequiredLessons({
    courseId,
    quizId,
    quizCourseItemId: quiz.courseItemId,
    user: session.user,
    course: quiz.courseItem.course,
  });

  const completedAttempts = quiz.attempts.filter((attempt) => attempt.outcome !== "IN_PROGRESS");
  const draftAttempt = quiz.attempts.find((attempt) => attempt.outcome === "IN_PROGRESS") ?? null;
  const alreadyPassed = completedAttempts.some((attempt) => attempt.outcome === "PASSED");
  const hasPendingReview = completedAttempts.some((attempt) => attempt.outcome === "PENDING_REVIEW");
  if (alreadyPassed) return { saved: false };
  if (hasPendingReview) return { saved: false };
  if (
    isAssessmentTimeLimitExpired({
      attempt: draftAttempt,
      timeLimitMinutes: quiz.timeLimitMinutes,
      now: new Date(),
    })
  ) {
    return { saved: false };
  }
  const retryAvailableAt = getAssessmentRetryAvailableAt(completedAttempts, quiz.retryDelayMinutes);
  if (!draftAttempt && retryAvailableAt && retryAvailableAt.getTime() > Date.now()) return { saved: false };

  if (!draftAttempt && completedAttempts.length >= quiz.maxAttempts) {
    return { saved: false };
  }

  const deliveryQuestions = getQuizAttemptDeliveryQuestions(draftAttempt, questions);
  const answers = readAnswersFromFormData(deliveryQuestions, formData);
  if (!hasAnyFilledAnswer(answers)) return { saved: false };
  const securityEventsJson = normalizeSecurityEventsJson(formData);

  await saveAssessmentDraft({
    quizId,
    userId: session.user.id,
    questions: deliveryQuestions,
    answers,
    maxAttempts: quiz.maxAttempts,
    retryDelayMinutes: quiz.retryDelayMinutes,
    timeLimitMinutes: quiz.timeLimitMinutes,
    securityEventsJson,
  });

  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/quiz/${quizId}`);

  return { saved: true };
}

export async function startQuizAttempt(quizId: string, courseId: string) {
  const session = await requireSession();
  const { quiz, questions } = await loadQuizDeliveryContext({
    quizId,
    courseId,
    user: session.user,
  });
  const allowed = await canOpenQuizPage(
    session.user.id,
    session.user.roles,
    quiz,
    session.user.permissions,
  );
  if (!allowed) throw new Error("Нет доступа к тесту");
  await ensureQuizUnlockedByRequiredLessons({
    courseId,
    quizId,
    quizCourseItemId: quiz.courseItemId,
    user: session.user,
    course: quiz.courseItem.course,
  });

  const preparedQuestions = prepareAssessmentQuestions(questions, {
    shuffleAnswers: quiz.shuffleAnswers,
    shuffleQuestions: quiz.shuffleQuestions,
    questionPoolSize: quiz.questionPoolSize,
  });
  if (preparedQuestions.length === 0) throw new Error("В тесте нет вопросов");

  await startAssessmentAttempt({
    quizId,
    userId: session.user.id,
    questions: preparedQuestions,
    maxAttempts: quiz.maxAttempts,
    retryDelayMinutes: quiz.retryDelayMinutes,
  });
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/quiz/${quizId}`);
  redirect(`/courses/${courseId}/quiz/${quizId}`);
}

export async function submitQuizAttempt(
  quizId: string,
  courseId: string,
  formData: FormData
) {
  const session = await requireSession();

  const { quiz, questions } = await loadQuizDeliveryContext({
    quizId,
    courseId,
    user: session.user,
  });

  const allowed = await canOpenQuizPage(
    session.user.id,
    session.user.roles,
    quiz,
    session.user.permissions
  );
  if (!allowed) throw new Error("Нет доступа к тесту");
  await ensureQuizUnlockedByRequiredLessons({
    courseId,
    quizId,
    quizCourseItemId: quiz.courseItemId,
    user: session.user,
    course: quiz.courseItem.course,
  });

  const completedAttempts = quiz.attempts.filter((attempt) => attempt.outcome !== "IN_PROGRESS");
  const draftAttempt = quiz.attempts.find((attempt) => attempt.outcome === "IN_PROGRESS") ?? null;
  const alreadyPassed = completedAttempts.some((attempt) => attempt.outcome === "PASSED");
  const hasPendingReview = completedAttempts.some((attempt) => attempt.outcome === "PENDING_REVIEW");
  if (alreadyPassed) {
    throw new Error("Тест уже успешно сдан");
  }
  if (hasPendingReview) {
    throw new Error("Этот тест уже отправлен на проверку");
  }

  if (!draftAttempt && completedAttempts.length >= quiz.maxAttempts) {
    throw new Error("Попытки закончились");
  }
  const retryAvailableAt = getAssessmentRetryAvailableAt(completedAttempts, quiz.retryDelayMinutes);
  if (!draftAttempt && retryAvailableAt && retryAvailableAt.getTime() > Date.now()) {
    throw new Error(`Следующая попытка будет доступна ${retryAvailableAt.toLocaleString("ru-RU")}.`);
  }

  const deliveryQuestions = getQuizAttemptDeliveryQuestions(draftAttempt, questions);
  const answers = readAnswersFromFormData(deliveryQuestions, formData);
  const securityEventsJson = normalizeSecurityEventsJson(formData);
  const result = await submitAssessmentAttempt({
    quizId,
    userId: session.user.id,
    questions: deliveryQuestions,
    answers,
    maxAttempts: quiz.maxAttempts,
    minCorrectAnswers: quiz.minCorrectAnswers,
    retryDelayMinutes: quiz.retryDelayMinutes,
    timeLimitMinutes: quiz.timeLimitMinutes,
    securityEventsJson,
  });

  // Точка выдачи №2: сдача теста завершила курс. PENDING_REVIEW — ещё не завершение.
  if (result.outcome === "PASSED" || result.outcome === "FAILED") {
    try {
      await issueCertificateIfCompleted({
        userId: session.user.id,
        courseId,
        issuedVia: "ASSESSMENT_SUBMIT",
      });
    } catch (error) {
      console.error("Не удалось выдать сертификат после сдачи теста:", error);
    }
  }

  revalidatePath("/");
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/manage`);
  redirect(`/courses/${courseId}/quiz/${quizId}/result?attempt=${result.attemptId}`);
}

export async function reviewQuizAttempt(courseId: string, attemptId: string, formData: FormData) {
  const session = await requireManageCourse(courseId);
  const reviewStatus = getCourseManualReviewStatusParam(asString(formData, "reviewStatus") || undefined);
  const returnParams = {
    section: "reviews",
    reviewStatus: reviewStatus === "all" ? undefined : reviewStatus,
    attempt: attemptId,
  } satisfies Record<string, string | undefined>;
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      quizId: true,
      userId: true,
      attemptNumber: true,
      answers: true,
      questionSnapshot: true,
      outcome: true,
      manualReviewJson: true,
      reviewComment: true,
      reviewedAt: true,
      quiz: {
        select: {
          id: true,
          minCorrectAnswers: true,
          maxAttempts: true,
          courseItem: {
            select: {
              title: true,
              courseId: true,
              course: {
                select: {
                  title: true,
                },
              },
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          login: true,
          email: true,
          firstName: true,
        },
      },
    },
  });

  if (!attempt || attempt.quiz.courseItem.courseId !== courseId) {
    redirect(manageCourseUrl(courseId, { ...returnParams, reviewError: "Работа не найдена." }));
  }

  let nextReviewData: Record<string, { accepted: boolean; awardedPoints: number }>;
  let reviewComment: string | null;

  try {
    const snapshot = parseQuestionSnapshot(attempt.questionSnapshot);
    const answers = parseAttemptAnswersFromJson(attempt.answers);
    const currentReviewData = parseManualReviewData(attempt.manualReviewJson);
    const manualQuestions = getManualReviewQuestions(snapshot, answers, currentReviewData);

    if (manualQuestions.length === 0) {
      redirect(
        manageCourseUrl(courseId, {
          ...returnParams,
          reviewError: "В этой попытке нет вопросов с ручной проверкой.",
        })
      );
    }

    nextReviewData = Object.fromEntries(
      manualQuestions.map((item) => [
        item.question.id,
        {
          accepted: parseManualReviewAccepted(formData, item.question.id),
          awardedPoints: parseManualReviewPoints(formData, item.question.id, item.question.points),
        },
      ])
    );

    reviewComment = asOptionalString(formData, "reviewComment");
  } catch (error) {
    console.error("Failed to parse manual review payload", error);
    redirect(
      manageCourseUrl(courseId, {
        ...returnParams,
        reviewError: error instanceof Error ? error.message : "Не удалось сохранить проверку.",
      })
    );
  }

  const reviewerName =
    ("name" in session.user && typeof session.user.name === "string" && session.user.name.trim()) ||
    "Преподаватель";

  let finalized;
  try {
    finalized = await reviewAssessmentAttempt({
      attemptId: attempt.id,
      reviewer: { id: session.user.id, name: reviewerName },
      review: nextReviewData,
      comment: reviewComment,
      expectedReviewedAt: attempt.reviewedAt,
    });
  } catch (error) {
    console.error("Failed to save manual assessment review", error);
    redirect(
      manageCourseUrl(courseId, {
        ...returnParams,
        reviewError: error instanceof Error ? error.message : "Не удалось сохранить проверку.",
      }),
    );
  }

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "quizzes:review_attempt",
    objectType: "quiz_attempt",
    objectId: attempt.id,
    objectLabel: `${attempt.quiz.courseItem.title} · ${attempt.user.login} · попытка ${attempt.attemptNumber}`,
    metadata: {
      courseId,
      quizId: attempt.quiz.id,
      learnerId: attempt.user.id,
      previousOutcome: finalized.previousOutcome,
      nextOutcome: finalized.outcome,
      reviewComment,
      reviewData: nextReviewData,
    },
  });

  // Точка выдачи №3: курс завершается в момент действия ПРЕПОДАВАТЕЛЯ. Без неё
  // ученики с вопросами на ручной проверке остались бы без сертификата навсегда.
  if (finalized.outcome === "PASSED" || finalized.outcome === "FAILED") {
    try {
      await issueCertificateIfCompleted({
        userId: attempt.user.id,
        courseId,
        issuedVia: "ASSESSMENT_REVIEW",
      });
    } catch (error) {
      console.error("Не удалось выдать сертификат после ручной проверки:", error);
    }
  }

  if (attempt.user.email) {
    await enqueueQuizReviewedEmails(
      [
        {
          email: attempt.user.email,
          name: attempt.user.name,
          firstName: attempt.user.firstName,
        },
      ],
      {
        courseId,
        courseTitle: attempt.quiz.courseItem.course.title,
        quizId: attempt.quiz.id,
        quizTitle: attempt.quiz.courseItem.title,
        resultUrl: `/courses/${courseId}/quiz/${attempt.quiz.id}/result?attempt=${attempt.id}`,
        outcome: finalized.outcome,
        reviewComment,
        reviewedAt: finalized.reviewedAt,
      }
    );
  }

  revalidatePath("/");
  revalidatePath("/courses");
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/manage`);
  revalidatePath(`/courses/${courseId}/results`);
  revalidatePath(`/courses/${courseId}/learners`);
  revalidatePath(`/courses/${courseId}/learners/${attempt.user.id}`);
  revalidatePath(`/courses/${courseId}/quiz/${attempt.quiz.id}`);
  revalidatePath(`/courses/${courseId}/quiz/${attempt.quiz.id}/result`);
  revalidatePath("/admin/reports/learner-progress");
  revalidatePath(`/admin/reports/${attempt.user.id}`);

  redirect(
    manageCourseUrl(courseId, {
      ...returnParams,
      reviewSaved:
        finalized.outcome === "PASSED"
          ? "Работа проверена и зачтена."
          : "Работа проверена. Итог обновлен.",
    })
  );
}

function manageCourseUrl(courseId: string, params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => { if (value) search.set(key, value); });
  const query = search.toString();
  return query ? `/courses/${courseId}/manage?${query}` : `/courses/${courseId}/manage`;
}
