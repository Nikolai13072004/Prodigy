import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { saveQuizAttemptProgress, startQuizAttempt, submitQuizAttempt } from "@/app/actions/course-assessment-actions";
import { QuizTakeStepper } from "@/components/QuizTakeStepper";
import { canManageCourse, canOpenQuizPage } from "@/lib/access";
import {
  isPublishedSnapshotActive,
  parsePublishedCourseSnapshot,
} from "@/lib/course-content";
import { buildCourseOutline } from "@/lib/course-navigation";
import { getQuizProgress } from "@/lib/course-progress";
import { getRequiredCorrectAnswers } from "@/lib/quiz-pass-rule";
import { parseQuestionSnapshot } from "@/lib/quiz-manual-review";
import prisma from "@/lib/prisma";
import { canTrackLearningProgress } from "@/lib/roles";
import {
  getAssessmentRetryAvailableAt as getRetryAvailableAt,
  getEffectiveQuestionCount,
} from "@/modules/assessment/domain/delivery";

type Props = { params: Promise<{ id: string; quizId: string }> };

export default async function QuizTakePage({ params }: Props) {
  const { id: courseId, quizId } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      courseItem: {
        include: {
          course: {
            select: {
              id: true,
              title: true,
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
        orderBy: { orderIndex: "asc" },
      },
      attempts: {
        where: { userId: session.user.id },
        orderBy: { attemptNumber: "asc" },
      },
    },
  });

  if (!quiz || quiz.courseItem.courseId !== courseId) notFound();

  const allowed = await canOpenQuizPage(
    session.user.id,
    session.user.roles,
    quiz,
    session.user.permissions
  );
  if (!allowed) redirect(`/courses/${courseId}`);

  const canTakeKnowledgeCheck = canTrackLearningProgress(
    session.user.roles,
    session.user.permissions
  );

  const showPublishedSnapshot =
    isPublishedSnapshotActive(quiz.courseItem.course) &&
    !canManageCourse(session.user.roles, session.user.id, {
      ownerId: quiz.courseItem.course.ownerId,
    });
  const publishedSnapshot = showPublishedSnapshot
    ? parsePublishedCourseSnapshot(quiz.courseItem.course.publishedSnapshotJson)
    : null;
  const snapshotItem = publishedSnapshot?.items.find((item) => item.quiz?.id === quizId) ?? null;
  const displayTitle = snapshotItem?.title ?? quiz.courseItem.title;
  const displayDescription = snapshotItem?.quiz?.description ?? quiz.description;
  const displayQuestions = snapshotItem?.quiz?.questions ?? quiz.questions;
  const deliverySettings = {
    timeLimitMinutes: snapshotItem?.quiz?.timeLimitMinutes ?? quiz.timeLimitMinutes,
    shuffleQuestions: snapshotItem?.quiz?.shuffleQuestions ?? quiz.shuffleQuestions,
    shuffleAnswers: snapshotItem?.quiz?.shuffleAnswers ?? quiz.shuffleAnswers,
    lockMaterialsOnStart: snapshotItem?.quiz?.lockMaterialsOnStart ?? quiz.lockMaterialsOnStart,
    questionPoolSize: snapshotItem?.quiz?.questionPoolSize ?? quiz.questionPoolSize,
    retryDelayMinutes: snapshotItem?.quiz?.retryDelayMinutes ?? quiz.retryDelayMinutes,
    trackSecurityEvents: snapshotItem?.quiz?.trackSecurityEvents ?? quiz.trackSecurityEvents,
  };

  if (canTakeKnowledgeCheck) {
    const courseItems = await prisma.courseItem.findMany({
      where: publishedSnapshot
        ? {
            id: {
              in: publishedSnapshot.items.map((item) => item.id),
            },
          }
        : { courseId, archivedAt: null },
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
              timeLimitMinutes: true,
              shuffleQuestions: true,
              shuffleAnswers: true,
              lockMaterialsOnStart: true,
              questionPoolSize: true,
              retryDelayMinutes: true,
              trackSecurityEvents: true,
              questions: {
                where: { archivedAt: null },
                select: {
                  id: true,
                },
              },
              attempts: {
                where: { userId: session.user.id },
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
                  timeLimitMinutes: item.quiz.timeLimitMinutes,
                  shuffleQuestions: item.quiz.shuffleQuestions,
                  shuffleAnswers: item.quiz.shuffleAnswers,
                  lockMaterialsOnStart: item.quiz.lockMaterialsOnStart,
                  questionPoolSize: item.quiz.questionPoolSize,
                  retryDelayMinutes: item.quiz.retryDelayMinutes,
                  trackSecurityEvents: item.quiz.trackSecurityEvents,
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
      (publishedSnapshot?.navigationMode ?? quiz.courseItem.course.navigationMode) === "SEQUENTIAL"
        ? "SEQUENTIAL"
        : "FREE";
    const quizGateMode =
      (publishedSnapshot?.quizGateMode ?? quiz.courseItem.course.quizGateMode) === "PASSED" ? "PASSED" : "RESOLVED";
    const outline = buildCourseOutline(displayCourseItems, navigationMode, {
      lockQuizzesUntilPreviousRequiredComplete: true,
      quizGateMode,
    });
    const currentEntry = outline.find((item) => item.id === quiz.courseItemId) ?? null;
    if (currentEntry?.isLocked) {
      redirect(`/courses/${courseId}?item=${quiz.courseItemId}`);
    }
  }

  if (canTakeKnowledgeCheck) {
    await prisma.courseLearnerState.upsert({
      where: {
        courseId_userId: {
          courseId,
          userId: session.user.id,
        },
      },
      create: {
        courseId,
        userId: session.user.id,
        lastOpenedCourseItemId: quiz.courseItemId,
      },
      update: {
        lastOpenedCourseItemId: quiz.courseItemId,
      },
    });
  }

  const attempts = quiz.attempts;
  const progress = getQuizProgress(quiz, attempts);
  const effectiveQuestionCount = getEffectiveQuestionCount(displayQuestions.length, deliverySettings.questionPoolSize);
  const requiredCorrectAnswers = getRequiredCorrectAnswers(
    quiz.minCorrectAnswers,
    effectiveQuestionCount
  );
  const hasPassed = attempts.some((attempt) => attempt.outcome === "PASSED");
  const retryAvailableAt = getRetryAvailableAt(attempts, deliverySettings.retryDelayMinutes);
  const now = new Date();
  const isRetryDelayed = Boolean(retryAvailableAt && retryAvailableAt.getTime() > now.getTime() && !progress.hasInProgress);
  const canAttempt =
    !hasPassed &&
    !progress.hasPendingReview &&
    !isRetryDelayed &&
    (progress.hasInProgress || progress.attemptsUsed < quiz.maxAttempts);

  const resultAttempt =
    progress.status.code === "PENDING_REVIEW"
      ? progress.latestCompletedAttempt ?? progress.bestAttempt
      : progress.bestAttempt;
  if (!canAttempt && progress.status.code === "PASSED" && resultAttempt) {
    redirect(`/courses/${courseId}/quiz/${quizId}/result?attempt=${resultAttempt.id}`);
  }

  const latestReviewedAttempt =
    attempts
      .filter((attempt) => Boolean(attempt.reviewedAt || attempt.reviewComment))
      .sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime())[0] ?? null;
  const draftAttempt =
    attempts
      .filter((attempt) => attempt.outcome === "IN_PROGRESS")
      .sort((left, right) => right.attemptNumber - left.attemptNumber)[0] ?? null;
  const draftSnapshot = draftAttempt ? parseQuestionSnapshot(draftAttempt.questionSnapshot) : [];
  const deliveryQuestions = draftSnapshot.length > 0 ? draftSnapshot : displayQuestions;
  const quizExpiresAt =
    draftAttempt && deliverySettings.timeLimitMinutes
      ? new Date(draftAttempt.createdAt.getTime() + deliverySettings.timeLimitMinutes * 60 * 1000)
      : null;

  let initialAnswers: Record<string, string | string[]> = {};
  if (draftAttempt) {
    try {
      const raw = JSON.parse(draftAttempt.answers) as Record<string, unknown>;
      for (const [key, value] of Object.entries(raw)) {
        if (Array.isArray(value)) {
          initialAnswers[key] = value.map((entry) => String(entry ?? ""));
        } else {
          initialAnswers[key] = String(value ?? "");
        }
      }
    } catch {
      initialAnswers = {};
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href={`/courses/${courseId}`} className="text-sm text-[var(--ink-muted)] underline">
        ← {quiz.courseItem.course.title}
      </Link>

      <div className="mt-4 rounded-xl border border-black bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{displayTitle}</h1>
            {displayDescription && <p className="mt-2 text-sm text-[var(--ink)]">{displayDescription}</p>}
            <p className="mt-2 text-sm text-[var(--ink)]">
              Попыток использовано: {progress.attemptsUsed}/{quiz.maxAttempts}. Минимум правильных
              ответов для сдачи: {requiredCorrectAnswers}.
              {deliverySettings.timeLimitMinutes ? ` Лимит времени: ${deliverySettings.timeLimitMinutes} мин.` : ""}
              {deliverySettings.questionPoolSize && deliverySettings.questionPoolSize < displayQuestions.length
                ? ` В попытку попадет ${effectiveQuestionCount} из ${displayQuestions.length} вопросов.`
                : ""}
            </p>
            {deliverySettings.lockMaterialsOnStart && draftAttempt ? (
              <p className="mt-2 text-sm text-[var(--warning)]">
                Пока попытка не завершена, материалы курса будут недоступны.
              </p>
            ) : null}
            {isRetryDelayed && retryAvailableAt ? (
              <p className="mt-2 text-sm text-[var(--warning)]">
                Следующая попытка будет доступна {retryAvailableAt.toLocaleString("ru-RU")}.
              </p>
            ) : null}
          </div>
          <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--ink)]">
            {progress.status.label}
          </span>
        </div>
      </div>

      {latestReviewedAttempt ? (
        <div className="mt-6 rounded-xl border border-[var(--success)] bg-[var(--success-soft)] p-5 text-sm text-[var(--success)]">
          <p className="font-medium">Последняя работа уже проверена преподавателем.</p>
          <p className="mt-1">
            {latestReviewedAttempt.reviewedAt
              ? `Проверено ${latestReviewedAttempt.reviewedAt.toLocaleString("ru-RU")}.`
              : "Результат проверки сохранен."}
          </p>
          {latestReviewedAttempt.reviewComment ? (
            <p className="mt-2 whitespace-pre-wrap text-[var(--ink)]">{latestReviewedAttempt.reviewComment}</p>
          ) : null}
          <Link
            href={`/courses/${courseId}/quiz/${quizId}/result?attempt=${latestReviewedAttempt.id}`}
            className="mt-4 inline-flex rounded-md bg-[var(--accent)] px-3 py-2 font-medium text-white hover:bg-[var(--accent-strong)]"
          >
            Открыть проверенную работу
          </Link>
        </div>
      ) : null}

      {deliveryQuestions.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--ink)]">
          В этом тесте пока нет вопросов. Откройте управление курсом и добавьте их.
        </p>
      ) : !canAttempt ? (
        <div className="mt-6 rounded-xl border border-black bg-white p-5">
          <p className="text-sm text-[var(--ink)]">
            {isRetryDelayed && retryAvailableAt
              ? `Следующая попытка будет доступна ${retryAvailableAt.toLocaleString("ru-RU")}.`
              : progress.status.code === "PENDING_REVIEW"
              ? "Новая попытка недоступна, потому что тест уже отправлен на проверку преподавателю."
              : "Новая попытка недоступна. Для этого теста уже зафиксирован итоговый статус "}
            {isRetryDelayed || progress.status.code === "PENDING_REVIEW" ? null : (
              <>
                <strong>{progress.status.label}</strong>.
              </>
            )}
          </p>
          {resultAttempt && (
            <Link
              href={`/courses/${courseId}/quiz/${quizId}/result?attempt=${resultAttempt.id}`}
              className="mt-4 inline-flex rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
            >
              {progress.status.code === "PENDING_REVIEW"
                ? "Открыть отправленную работу"
                : "Открыть итоговый результат"}
            </Link>
          )}
        </div>
      ) : !draftAttempt ? (
        <form action={startQuizAttempt.bind(null, quizId, courseId)} className="mt-6 rounded-xl border border-black bg-white p-5">
          <p className="text-sm text-[var(--ink)]">
            Попытка начнётся после нажатия кнопки. После старта включится таймер и могут заблокироваться материалы курса.
          </p>
          <button type="submit" className="mt-4 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]">
            Начать попытку
          </button>
        </form>
      ) : (
        <QuizTakeStepper
	          courseId={courseId}
	          quizId={quizId}
	          questions={deliveryQuestions.map((question) => ({
	            id: question.id,
	            type: question.type,
	            prompt: question.prompt,
	            config: question.config,
	            points: question.points,
	          }))}
	          expiresAt={quizExpiresAt?.toISOString() ?? null}
	          timeLimitMinutes={deliverySettings.timeLimitMinutes}
          trackSecurityEvents={deliverySettings.trackSecurityEvents}
          initialAnswers={initialAnswers}
          hasInProgressAttempt={progress.hasInProgress}
          saveDraftAction={saveQuizAttemptProgress.bind(null, quizId, courseId)}
          submitAction={submitQuizAttempt.bind(null, quizId, courseId)}
        />
      )}
    </main>
  );
}
