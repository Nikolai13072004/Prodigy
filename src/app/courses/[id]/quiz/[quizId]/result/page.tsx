import Link from "next/link";
import { Check, Clock3, RotateCcw, Star, X } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { QuizQuestionMediaViewer } from "@/components/QuizQuestionMediaViewer";
import { canManageCourse } from "@/lib/access";
import { getCourseProgress, getQuizProgress } from "@/lib/course-progress";
import { getPlatformSettings } from "@/lib/platform-settings";
import {
  isManualReviewQuestion,
  parseFileAnswer,
  parseManualReviewData,
  type ManualReviewEntry,
} from "@/lib/quiz-manual-review";
import prisma from "@/lib/prisma";
import { parseQuizQuestionMediaFromConfig } from "@/lib/quiz-question-media";
import { ROLES, canTrackMaterialProgress, hasRole, isPlatformAdminRole } from "@/lib/roles";

type Props = {
  params: Promise<{ id: string; quizId: string }>;
  searchParams: Promise<{ attempt?: string }>;
};

type QuestionSnapshot = {
  id: string;
  orderIndex: number;
  type: string;
  prompt: string;
  config: string;
  points: number;
};

export default async function QuizResultPage({ params, searchParams }: Props) {
  const { id: courseId, quizId } = await params;
  const sp = await searchParams;

  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!sp.attempt) notFound();

  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: sp.attempt },
    include: {
      quiz: {
        include: {
          courseItem: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                  ownerId: true,
                  resultViewMode: true,
                  quizGateMode: true,
                  items: {
                    where: { archivedAt: null },
                    orderBy: { orderIndex: "asc" },
                    select: {
                      id: true,
                      title: true,
                      type: true,
                      isRequired: true,
                      views: {
                        where: { userId: session.user.id },
                        select: {
                          progressPercent: true,
                        },
                        take: 1,
                      },
                      quiz: {
                        select: {
                          maxAttempts: true,
                          minCorrectAnswers: true,
                          retryDelayMinutes: true,
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
                  },
                  feedbacks: {
                    where: { userId: session.user.id },
                    select: { id: true },
                  },
                  surveyTemplate: {
                    select: {
                      isActive: true,
                      responses: {
                        where: { userId: session.user.id },
                        select: { id: true },
                        take: 1,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (
    !attempt ||
    attempt.quiz.id !== quizId ||
    attempt.quiz.courseItem.courseId !== courseId
  ) {
    notFound();
  }

  if (!isPlatformAdminRole(session.user.roles) && attempt.userId !== session.user.id) {
    redirect(`/courses/${courseId}`);
  }

  const snapshot = JSON.parse(attempt.questionSnapshot) as QuestionSnapshot[];
  const answers = JSON.parse(attempt.answers) as Record<string, unknown>;
  const reviewData = parseManualReviewData(attempt.manualReviewJson);
  const course = attempt.quiz.courseItem.course;
  const mode = course.resultViewMode;
  const platformSettings = await getPlatformSettings();
  const isOwnLearnerAttempt = attempt.userId === session.user.id;
  const isStudent = canTrackMaterialProgress(session.user.roles, session.user.permissions) &&
    hasRole(session.user.roles, ROLES.STUDENT);
  const courseProgress = getCourseProgress({
    courseTitle: course.title,
    quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
    items: course.items.map((item) => ({
      ...item,
      viewed: item.type === "QUIZ" ? false : item.views.length > 0,
      materialProgress: item.type === "QUIZ" ? 0 : item.views[0]?.progressPercent ?? 0,
    })),
  });
  const currentCourseItem = course.items.find((item) => item.id === attempt.quiz.courseItemId) ?? null;
  const currentQuizProgress = currentCourseItem?.quiz
    ? getQuizProgress(currentCourseItem.quiz, currentCourseItem.quiz.attempts)
    : null;
  const isCourseCompleted =
    isOwnLearnerAttempt && isStudent && courseProgress.isCompleted;
  const showSurveyCta =
    isCourseCompleted && Boolean(course.surveyTemplate?.isActive) && (course.surveyTemplate?.responses.length ?? 0) === 0;
  const showFeedbackCta =
    isCourseCompleted && !showSurveyCta && platformSettings.feedbackEnabled && course.feedbacks.length === 0;
  const retryAvailableAt =
    attempt.outcome === "FAILED" && attempt.quiz.retryDelayMinutes
      ? new Date(attempt.completedAt.getTime() + attempt.quiz.retryDelayMinutes * 60 * 1000)
      : null;
  const now = new Date();
  const isRetryLocked = Boolean(retryAvailableAt && retryAvailableAt.getTime() > now.getTime());
  const canRetryQuiz =
    attempt.outcome === "FAILED" &&
    !isRetryLocked &&
    Boolean(currentQuizProgress && currentQuizProgress.attemptsLeft > 0);
  const hasRemainingAttempts = Boolean(currentQuizProgress && currentQuizProgress.attemptsLeft > 0);
  const canAlwaysReviewAnswers = canManageCourse(session.user.roles, session.user.id, {
    ownerId: course.ownerId,
  });
  const canShowAnswerReview =
    mode !== "SCORE_ONLY" &&
    (canAlwaysReviewAnswers || attempt.outcome === "PASSED" || !hasRemainingAttempts);
  const securityEvents = parseSecurityEvents(attempt.securityEventsJson);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href={`/courses/${courseId}`}
        className="text-sm text-zinc-600 underline"
      >
        ← {attempt.quiz.courseItem.course.title}
      </Link>

      <QuizResultSummary
        courseId={courseId}
        quizHref={`/courses/${courseId}/quiz/${quizId}`}
        attemptNumber={attempt.attemptNumber}
        completedAt={attempt.completedAt}
        outcome={attempt.outcome}
        score={attempt.score}
        maxScore={attempt.maxScore}
        passingPercent={getPassingPercent(attempt.quiz.minCorrectAnswers, attempt.totalQuestions)}
        isCourseCompleted={isCourseCompleted}
        showSurveyCta={showSurveyCta}
        showFeedbackCta={showFeedbackCta}
        hasFeedback={course.feedbacks.length > 0}
        feedbackEnabled={platformSettings.feedbackEnabled}
        canRetryQuiz={canRetryQuiz}
        retryAvailableAt={retryAvailableAt}
        retryLocked={isRetryLocked}
      />

      {isRetryLocked && retryAvailableAt ? (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Следующая попытка будет доступна {retryAvailableAt.toLocaleString("ru-RU")}. До этого момента кнопка повтора скрыта.
        </div>
      ) : null}

      {securityEvents.length > 0 ? (
        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-zinc-950">События во время теста</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Зафиксированы потери фокуса или уход со страницы. Это не блокирует результат, но помогает проверяющему.
              </p>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              {securityEvents.length} событий
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {securityEvents.slice(-8).map((event, index) => (
              <li key={`${event.type}-${event.at.toISOString()}-${index}`} className="flex justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2">
                <span>{getSecurityEventLabel(event.type)}</span>
                <span className="shrink-0 text-xs text-zinc-500">{event.at.toLocaleString("ru-RU")}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {attempt.outcome === "PENDING_REVIEW" ? (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Закрытые вопросы проверены сразу, а задания с ручной проверкой сейчас находятся в
          статусе «На проверке».
        </div>
      ) : attempt.reviewedAt || attempt.reviewComment ? (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">Проверка преподавателя завершена.</p>
          <p className="mt-1">
            {attempt.reviewedAt
              ? `Проверено ${attempt.reviewedAt.toLocaleString("ru-RU")}`
              : "Результат ручной проверки сохранен."}
            {attempt.reviewedByName ? ` · ${attempt.reviewedByName}` : ""}
          </p>
          {attempt.reviewComment ? (
            <div className="mt-3 rounded-md border border-emerald-200 bg-white/80 p-3 text-zinc-800">
              <p className="font-medium">Комментарий преподавателя</p>
              <p className="mt-2 whitespace-pre-wrap">{attempt.reviewComment}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode !== "SCORE_ONLY" && !canShowAnswerReview ? (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Подробный разбор и правильные ответы будут доступны после успешной сдачи теста
          или когда закончатся доступные попытки.
        </div>
      ) : null}

      {canShowAnswerReview && (
        <section className="mt-8 space-y-4">
          {snapshot
            .slice()
            .sort((left, right) => left.orderIndex - right.orderIndex)
            .map((question, index) => (
              <ResultQuestionCard
                key={question.id}
                question={question}
                answer={answers[question.id]}
                review={reviewData[question.id] ?? null}
                index={index + 1}
                showFull={mode === "FULL_REVIEW"}
              />
            ))}
        </section>
      )}
    </main>
  );
}

function QuizResultSummary({
  courseId,
  quizHref,
  attemptNumber,
  completedAt,
  outcome,
  score,
  maxScore,
  passingPercent,
  isCourseCompleted,
  showSurveyCta,
  showFeedbackCta,
  hasFeedback,
  feedbackEnabled,
  canRetryQuiz,
  retryAvailableAt,
  retryLocked,
}: {
  courseId: string;
  quizHref: string;
  attemptNumber: number;
  completedAt: Date | null;
  outcome: string;
  score: number;
  maxScore: number;
  passingPercent: number;
  isCourseCompleted: boolean;
  showSurveyCta: boolean;
  showFeedbackCta: boolean;
  hasFeedback: boolean;
  feedbackEnabled: boolean;
  canRetryQuiz: boolean;
  retryAvailableAt: Date | null;
  retryLocked: boolean;
}) {
  const scorePercent = getScorePercent(score, maxScore);
  const resultTitle = getResultTitle(outcome);
  const resultDescription = isCourseCompleted
    ? "Все обязательные этапы пройдены. Выберите следующий шаг."
    : getResultDescription(outcome, canRetryQuiz);
  const showSecondaryCourseActions = isCourseCompleted;

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center shadow-sm">
      <p className="text-left text-xs text-zinc-500">
        Попытка №{attemptNumber} · завершена{" "}
        {completedAt ? completedAt.toLocaleString("ru-RU") : "в процессе"}
      </p>

      <div className="mt-8 flex items-center justify-center gap-5">
        <ResultGauge outcome={outcome} percent={scorePercent} />
        <div className="max-w-[120px] text-left text-xs text-zinc-500">
          <div>Проходной балл</div>
          <div className="mt-1 text-base font-semibold text-zinc-800">{passingPercent}%</div>
        </div>
      </div>

      <div className="mx-auto mt-7 max-w-xl">
        <h1 className="text-2xl font-bold text-zinc-950">{resultTitle}</h1>
        <p className="mt-2 text-sm text-zinc-600">{resultDescription}</p>
        {feedbackEnabled && hasFeedback ? (
          <p className="mt-3 text-sm font-medium text-emerald-700">Спасибо, ваша оценка курса сохранена.</p>
        ) : null}
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        {showSurveyCta ? (
          <Link
            href={`/courses/${courseId}/survey`}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Star aria-hidden="true" className="h-4 w-4" />
            Пройти опрос
          </Link>
        ) : showFeedbackCta ? (
          <Link
            href={`/courses/${courseId}/feedback`}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Star aria-hidden="true" className="h-4 w-4" />
            Оценить курс
          </Link>
        ) : (
          <Link
            href={`/courses/${courseId}`}
            className="inline-flex h-10 items-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Завершить
          </Link>
        )}
        {canRetryQuiz ? (
          <Link
            href={quizHref}
            prefetch={false}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Пройти заново
          </Link>
        ) : null}
        {!canRetryQuiz && outcome === "FAILED" && retryAvailableAt && retryLocked ? (
          <span className="inline-flex h-10 items-center rounded-md border border-amber-200 bg-amber-50 px-4 text-sm font-medium text-amber-800">
            Повтор с {retryAvailableAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : null}
        {showFeedbackCta ? (
          <Link
            href={`/courses/${courseId}`}
            className="inline-flex h-10 items-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            К карточке курса
          </Link>
        ) : null}
        {showSecondaryCourseActions ? (
          <Link
            href="/courses"
            className="inline-flex h-10 items-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Мои курсы
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function ResultGauge({ outcome, percent }: { outcome: string; percent: number }) {
  const tone = getOutcomeTone(outcome);
  const Icon = outcome === "PASSED" ? Check : outcome === "FAILED" ? X : Clock3;

  return (
    <div className="relative h-36 w-36">
      <svg aria-hidden="true" viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-zinc-200"
        />
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={100 - percent}
          className={tone.ring}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Icon aria-hidden="true" className={`h-7 w-7 ${tone.text}`} strokeWidth={2.4} />
        <span className="mt-1 text-3xl font-bold text-zinc-950">{percent}%</span>
      </div>
    </div>
  );
}

function getScorePercent(score: number, maxScore: number) {
  if (maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
}

function getPassingPercent(minCorrectAnswers: number, totalQuestions: number) {
  if (totalQuestions <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((minCorrectAnswers / totalQuestions) * 100)));
}

function getResultTitle(outcome: string) {
  if (outcome === "PASSED") return "Поздравляем, вы прошли тест!";
  if (outcome === "FAILED") return "Вы не прошли тест";
  if (outcome === "PENDING_REVIEW") return "Работа отправлена на проверку";
  return "Попытка не завершена";
}

function getResultDescription(outcome: string, canRetryQuiz: boolean) {
  if (outcome === "PASSED") return "Тестирование успешно завершено.";
  if (outcome === "FAILED") {
    return canRetryQuiz
      ? "К сожалению, вам не удалось пройти тест. Можно попробовать еще раз."
      : "К сожалению, вам не удалось пройти тест. Доступных попыток больше нет.";
  }
  if (outcome === "PENDING_REVIEW") return "Ответы с ручной проверкой ожидают оценки преподавателя.";
  return "Вы можете вернуться к тесту и завершить попытку.";
}

function getOutcomeTone(outcome: string) {
  if (outcome === "PASSED") {
    return {
      ring: "text-emerald-500",
      text: "text-emerald-600",
    };
  }

  if (outcome === "FAILED") {
    return {
      ring: "text-zinc-600",
      text: "text-zinc-600",
    };
  }

  return {
    ring: "text-amber-500",
    text: "text-amber-600",
  };
}

function parseSecurityEvents(raw: string | null) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((event) => {
        if (!event || typeof event !== "object" || Array.isArray(event)) return null;
        const type = "type" in event ? String(event.type ?? "").trim() : "";
        const atRaw = "at" in event ? String(event.at ?? "").trim() : "";
        const at = new Date(atRaw);
        if (!type || Number.isNaN(at.getTime())) return null;
        return { type, at };
      })
      .filter((event): event is { type: string; at: Date } => Boolean(event));
  } catch {
    return [];
  }
}

function getSecurityEventLabel(type: string) {
  if (type === "visibility_hidden") return "Вкладка была скрыта";
  if (type === "window_blur") return "Окно потеряло фокус";
  if (type === "before_unload") return "Попытка закрыть или обновить страницу";
  return type;
}

function ResultQuestionCard({
  question,
  answer,
  review,
  index,
  showFull,
}: {
  question: QuestionSnapshot;
  answer: unknown;
  review: ManualReviewEntry | null;
  index: number;
  showFull: boolean;
}) {
  const needsManualReview = isManualReviewQuestion(question);
  const isCorrect = needsManualReview ? false : isAnswerCorrect(question, answer);
  const fileAnswer = question.type === "FILE" ? parseFileAnswer(answer) : null;
  const isAccepted = review?.accepted ?? false;
  const awardedPoints = review ? Math.max(0, Math.min(question.points, review.awardedPoints)) : null;

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Вопрос {index}
          </div>
          <h2 className="mt-2 font-semibold">{question.prompt}</h2>
          <QuizQuestionMediaViewer
            media={parseQuizQuestionMediaFromConfig(question.config)}
            className="mt-4"
          />
        </div>
        {(showFull || needsManualReview) && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              needsManualReview
                ? review
                  ? isAccepted
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
                : isCorrect
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
            }`}
          >
            {needsManualReview
              ? review
                ? isAccepted
                  ? "Зачтено"
                  : "Не зачтено"
                : "На проверке"
              : isCorrect
                ? "Верно"
                : "Ошибка"}
          </span>
        )}
      </div>

      {needsManualReview ? (
        <div className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p>
            {review
              ? "Ответ проверен преподавателем."
              : "Ответ отправлен преподавателю и будет оценен отдельно."}
          </p>
          {question.type === "FILE" ? (
            <p>
              <span className="font-medium">Файл ученика: </span>
              {fileAnswer ? (
                <a href={fileAnswer.url} target="_blank" rel="noreferrer" className="underline">
                  {fileAnswer.fileName}
                </a>
              ) : (
                "Файл не найден"
              )}
            </p>
          ) : (
            <p>
              <span className="font-medium">Ответ ученика: </span>
              {formatUserAnswer(question, answer)}
            </p>
          )}
          {review ? (
            <>
              <p>
                <span className="font-medium">Решение: </span>
                {isAccepted ? "зачтено" : "не зачтено"}
              </p>
              <p>
                <span className="font-medium">Баллы: </span>
                {awardedPoints ?? 0}/{question.points}
              </p>
            </>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 text-sm text-zinc-700">
          <p>
            <span className="font-medium">Правильный ответ: </span>
            {formatCorrectAnswer(question)}
          </p>
          {showFull && (
            <p className="mt-2">
              <span className="font-medium">Ответ сотрудника: </span>
              {formatUserAnswer(question, answer)}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function parseConfig(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function formatCorrectAnswer(question: QuestionSnapshot) {
  const config = parseConfig(question.config);

  if (question.type === "SINGLE_CHOICE") {
    const options = Array.isArray(config.options) ? config.options.map(String) : [];
    const correctIndex = Number(config.correctIndex ?? -1);
    return options[correctIndex] ?? "Не задан";
  }

  if (question.type === "OPEN") {
    if (String(config.reviewMode ?? "AUTO") === "MANUAL") {
      return "Проверит преподаватель";
    }
    return String(config.sampleAnswer ?? "Не задан");
  }

  if (question.type === "MATCHING") {
    const left = Array.isArray(config.left) ? config.left.map(String) : [];
    const right = Array.isArray(config.right) ? config.right.map(String) : [];
    const pairs = Array.isArray(config.correctPairs)
      ? config.correctPairs.map((value) => Number(value))
      : [];
    return left
      .map((value, index) => `${value} → ${right[pairs[index]] ?? "?"}`)
      .join("; ");
  }

  if (question.type === "FILE") {
    const allowedExtensions = Array.isArray(config.allowedExtensions)
      ? config.allowedExtensions.map((value) => String(value).toUpperCase())
      : [];
    const maxFileSizeMb = Number(config.maxFileSizeMb ?? 10);
    return `Файл (${allowedExtensions.join(", ") || "по настройке"}, до ${Math.max(maxFileSizeMb, 1)} МБ)`;
  }

  return "Неизвестный тип";
}

function formatUserAnswer(question: QuestionSnapshot, answer: unknown) {
  const config = parseConfig(question.config);

  if (question.type === "SINGLE_CHOICE") {
    const options = Array.isArray(config.options) ? config.options.map(String) : [];
    const selected = Number(answer ?? -1);
    return options[selected] ?? "Нет ответа";
  }

  if (question.type === "OPEN") {
    return String(answer ?? "Нет ответа");
  }

  if (question.type === "MATCHING") {
    const left = Array.isArray(config.left) ? config.left.map(String) : [];
    const right = Array.isArray(config.right) ? config.right.map(String) : [];
    const selected = Array.isArray(answer) ? answer.map((value) => Number(value)) : [];
    return left
      .map((value, index) => `${value} → ${right[selected[index]] ?? "?"}`)
      .join("; ");
  }

  if (question.type === "FILE") {
    return parseFileAnswer(answer)?.fileName ?? "Нет файла";
  }

  return "Нет ответа";
}

function isAnswerCorrect(question: QuestionSnapshot, answer: unknown) {
  const config = parseConfig(question.config);

  if (question.type === "SINGLE_CHOICE") {
    return Number(answer ?? -1) === Number(config.correctIndex ?? -1);
  }

  if (question.type === "OPEN") {
    if (String(config.reviewMode ?? "AUTO") === "MANUAL") {
      return false;
    }
    return (
      String(answer ?? "").trim().toLowerCase() ===
      String(config.sampleAnswer ?? "").trim().toLowerCase()
    );
  }

  if (question.type === "MATCHING") {
    const selected = Array.isArray(answer) ? answer.map((value) => Number(value)) : [];
    const expected = Array.isArray(config.correctPairs)
      ? config.correctPairs.map((value) => Number(value))
      : [];
    return (
      selected.length === expected.length &&
      selected.every((value, index) => value === expected[index])
    );
  }

  return false;
}
