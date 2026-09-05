import Link from "next/link";
import { ClipboardCheck, ClipboardList, FileText, Film, Files } from "lucide-react";
import { Badge, Card, Progress, buttonStyles } from "@/components/ui";
import { type CourseAccessWindow } from "@/lib/course-access-window";
import { getCourseDeadlineMeta } from "@/lib/course-deadline";
import { appendCourseReturnSource, type CourseReturnSource } from "@/lib/course-return-source";
import { type CourseOutlineEntry } from "@/lib/course-navigation";
import { getQuizProgress } from "@/lib/course-progress";
import { getRequiredCorrectAnswers } from "@/lib/quiz-pass-rule";
import { buildCourseEntryResumeHref } from "./hrefs";

// Презентационные карточки и хелперы страницы курса. Вынесены из page.tsx
// без изменения разметки/поведения (серверные компоненты без состояния).

export function CourseDeadlineStrip({
  accessWindow,
  isCompleted,
}: {
  accessWindow: CourseAccessWindow | null;
  isCompleted: boolean;
}) {
  const meta = getCourseDeadlineMeta(accessWindow, isCompleted);
  if (meta.isUnlimited) return null;

  const toneClass =
    meta.tone === "danger"
      ? "border-red-200/40 bg-red-500/15 text-red-50"
      : meta.tone === "warning"
        ? "border-amber-200/40 bg-amber-400/15 text-amber-50"
        : meta.tone === "success"
          ? "border-emerald-200/40 bg-emerald-400/15 text-emerald-50"
          : meta.tone === "info"
            ? "border-sky-200/40 bg-sky-400/15 text-sky-50"
            : "border-white/20 bg-white/10 text-white";

  return (
    <div className={`max-w-3xl rounded-lg border px-4 py-3 backdrop-blur ${toneClass}`}>
      <p className="text-sm font-semibold">{meta.title}</p>
    </div>
  );
}

export function NextStepCard({
  courseId,
  entry,
  isCourseCompleted,
  certificateSerial,
  showFeedbackCta,
  showSurveyCta,
  view,
  returnSource,
  asLearnerPreview,
}: {
  courseId: string;
  entry: CourseOutlineEntry | null;
  isCourseCompleted: boolean;
  certificateSerial: string | null;
  showFeedbackCta: boolean;
  showSurveyCta: boolean;
  view: string | undefined;
  returnSource: CourseReturnSource | null;
  asLearnerPreview: boolean;
}) {
  if (isCourseCompleted) {
    return (
      <div className="rounded-[var(--radius-panel)] bg-[var(--success-soft)] p-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--success)]">
              Курс завершен
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--ink)]">Все обязательные этапы пройдены</h2>
            {certificateSerial ? (
              <p className="mt-2 text-sm text-[var(--ink-muted)]">Сертификат о прохождении курса готов.</p>
            ) : showSurveyCta ? (
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                Осталось пройти короткий опрос по результатам обучения.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {certificateSerial ? (
              <Link href={`/certificates/${certificateSerial}`} className={buttonStyles("primary")}>
                Открыть сертификат
              </Link>
            ) : null}
            {showSurveyCta ? (
              <Link
                href={appendCourseReturnSource(`/courses/${courseId}/survey`, returnSource)}
                className={buttonStyles(certificateSerial ? "secondary" : "primary")}
              >
                Пройти опрос
              </Link>
            ) : showFeedbackCta ? (
              <Link
                href={appendCourseReturnSource(`/courses/${courseId}/feedback`, returnSource)}
                className={buttonStyles(certificateSerial ? "secondary" : "primary")}
              >
                Оценить курс
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <Card padding="sm">
        <h2 className="text-base font-semibold text-[var(--ink)]">Следующий шаг</h2>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">В курсе пока нет материалов для прохождения.</p>
      </Card>
    );
  }

  const isStarted = entry.progressPercent > 0;
  const attemptsLabel = entry.type === "QUIZ" ? getQuizAttemptsLabel(entry.quiz) : null;
  const showProgress = entry.type !== "QUIZ" && isStarted && entry.progressPercent < 100;
  const showStatusSummary = !showProgress || Boolean(attemptsLabel);

  return (
    <Card padding="sm">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
            Следующий шаг
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold text-[var(--ink)]">{entry.title}</h2>
          {showStatusSummary ? (
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {entry.statusLabel}
              {attemptsLabel ? ` · ${attemptsLabel}` : ""}
            </p>
          ) : null}

          {showProgress ? (
            <div className="mt-3 max-w-xl">
              <div className="flex items-center justify-between gap-3 text-xs text-[var(--ink-muted)]">
                <span>В процессе</span>
                <span>{entry.progressPercent}%</span>
              </div>
              <Progress value={entry.progressPercent} className="mt-1.5" />
            </div>
          ) : null}
        </div>

        <Link
          href={buildCourseEntryResumeHref(courseId, entry, view, returnSource, asLearnerPreview)}
          prefetch={entry.type === "QUIZ" || entry.type === "SURVEY" ? false : undefined}
          className={buttonStyles("primary")}
        >
          {isStarted ? "Продолжить" : "Начать"}
        </Link>
      </div>
    </Card>
  );
}

export function CourseContentListItem({
  courseId,
  item,
  isActive,
  view,
  returnSource,
  asLearnerPreview,
}: {
  courseId: string;
  item: CourseOutlineEntry;
  isActive: boolean;
  view: string | undefined;
  returnSource: CourseReturnSource | null;
  asLearnerPreview: boolean;
}) {
  const attemptsLabel = item.type === "QUIZ" ? getQuizAttemptsLabel(item.quiz) : null;
  const showProgress = item.type !== "QUIZ" && item.progressPercent > 0 && item.progressPercent < 100;
  const title = (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]"
        title={item.typeLabel}
        aria-label={item.typeLabel}
      >
        {getCourseItemRowIcon(item.type)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--ink)]">{item.title}</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          <span>Шаг {item.itemNumber}</span>
          <span> · {item.typeLabel}</span>
          {attemptsLabel ? <span> · {attemptsLabel}</span> : null}
        </p>
        {showProgress ? (
          <div className="mt-1 flex items-center gap-2">
            <Progress value={item.progressPercent} className="w-28" />
            <span className="text-xs text-[var(--ink-muted)]">{item.progressPercent}%</span>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (item.isLocked) {
    return (
      <li className="flex items-center justify-between gap-3 bg-[var(--surface)] px-3 py-3 opacity-75">
        {title}
        <CourseStatusPill label="Заблокирован" tone="locked" />
      </li>
    );
  }

  return (
    <li>
      <Link
        href={buildCourseEntryResumeHref(courseId, item, view, returnSource, asLearnerPreview)}
        prefetch={item.type === "QUIZ" || item.type === "SURVEY" ? false : undefined}
        className={`flex items-center justify-between gap-3 px-3 py-3 transition ${
          isActive ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--accent-soft)]"
        }`}
      >
        {title}
        <div className="flex shrink-0 items-center gap-3">
          <CourseStatusPill
            label={item.statusLabel}
            tone={item.isCompleted ? "completed" : item.progressPercent > 0 ? "progress" : "idle"}
          />
          <span className="hidden text-sm font-semibold text-[var(--accent)] sm:inline">
            {item.isCompleted
              ? "Открыть"
              : item.type === "QUIZ"
                ? "Открыть тест"
                : item.type === "SURVEY"
                  ? "Открыть опрос"
                : item.progressPercent > 0
                  ? "Продолжить"
                  : "Начать"}
          </span>
        </div>
      </Link>
    </li>
  );
}

function CourseStatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "completed" | "progress" | "idle" | "locked";
}) {
  const badgeTone = tone === "completed" ? "success" : tone === "progress" ? "warning" : "neutral";
  return <Badge tone={badgeTone}>{label}</Badge>;
}

function getCourseItemRowIcon(type: string) {
  if (type === "QUIZ") return <ClipboardCheck className="h-4 w-4" aria-hidden="true" />;
  if (type === "SURVEY") return <ClipboardList className="h-4 w-4" aria-hidden="true" />;
  if (type === "PDF") return <Files className="h-4 w-4" aria-hidden="true" />;
  if (type === "VIDEO") return <Film className="h-4 w-4" aria-hidden="true" />;
  return <FileText className="h-4 w-4" aria-hidden="true" />;
}

type QuizAttemptsSummarySource = {
  maxAttempts: number;
  minCorrectAnswers: number;
  attempts: {
    outcome: string;
    correctAnswers: number;
    attemptNumber: number;
    score: number;
    completedAt: Date;
  }[];
};

function getQuizAttemptsLabel(quiz: QuizAttemptsSummarySource | null) {
  if (!quiz) return null;

  const progress = getQuizProgress(quiz, quiz.attempts);
  if (progress.status.code === "PASSED") {
    return `Использовано попыток: ${progress.attemptsUsed} из ${quiz.maxAttempts}`;
  }
  if (progress.attemptsLeft <= 0 && !progress.hasInProgress) {
    return "Попытки закончились";
  }

  return `Осталось попыток: ${progress.attemptsLeft} из ${quiz.maxAttempts}`;
}

export function QuizCard({
  courseId,
  item,
  quizStatus,
  canOpenQuiz,
  returnSource,
}: {
  courseId: string;
  item: {
    id: string;
    title: string;
    isRequired: boolean;
    quiz: {
      id: string;
      maxAttempts: number;
      minCorrectAnswers: number;
      attempts: {
        id: string;
        outcome: string;
        correctAnswers: number;
        attemptNumber: number;
        score: number;
        completedAt: Date;
      }[];
      questions: { id: string }[];
    };
  };
  quizStatus: ReturnType<typeof getQuizProgress>;
  canOpenQuiz: boolean;
  returnSource: CourseReturnSource | null;
}) {
  const badgeTone =
    quizStatus.status.code === "PASSED"
      ? "success"
      : quizStatus.status.code === "IN_PROGRESS"
        ? "warning"
        : quizStatus.status.code === "FAILED"
          ? "danger"
          : "neutral";
  const requiredCorrectAnswers = getRequiredCorrectAnswers(
    item.quiz.minCorrectAnswers,
    item.quiz.questions.length
  );
  const attemptsLabel = getQuizAttemptsLabel(item.quiz);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[var(--ink)]">{item.title}</h3>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {item.isRequired ? "Обязательный тест" : "Дополнительный тест"} · минимум правильных
            ответов: {requiredCorrectAnswers}
            {attemptsLabel ? ` · ${attemptsLabel}` : ""}
          </p>
        </div>
        <Badge tone={badgeTone}>{quizStatus.status.label}</Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-[var(--ink-muted)]">
          Вопросов: {item.quiz.questions.length}
          {quizStatus.bestAttempt ? (
            <span>
              {" "}
              · лучшая попытка: {quizStatus.bestAttempt.correctAnswers}/
              {item.quiz.questions.length}
            </span>
          ) : null}
        </div>
        {canOpenQuiz ? (
          <Link
            href={appendCourseReturnSource(`/courses/${courseId}/quiz/${item.quiz.id}`, returnSource)}
            prefetch={false}
            className={buttonStyles("primary")}
          >
            Открыть тест
          </Link>
        ) : (
          <span className="text-sm text-[var(--ink-muted)]">Тест доступен назначенным сотрудникам</span>
        )}
      </div>
    </Card>
  );
}

export function SurveyCard({
  courseId,
  item,
  canOpenSurvey,
  returnSource,
}: {
  courseId: string;
  item: {
    id: string;
    title: string;
    isRequired: boolean;
    surveyTemplate: {
      id: string;
      title: string;
      isActive: boolean;
      questions: { id: string }[];
      responses: { id: string }[];
    } | null;
  };
  canOpenSurvey: boolean;
  returnSource: CourseReturnSource | null;
}) {
  const responseSent = Boolean(item.surveyTemplate?.responses.length);
  const isAvailable = Boolean(item.surveyTemplate?.isActive && item.surveyTemplate.questions.length > 0);
  const badgeTone = responseSent ? "success" : isAvailable ? "info" : "neutral";
  const badgeLabel = responseSent ? "Ответ отправлен" : isAvailable ? "Не пройден" : "Не настроен";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[var(--ink)]">{item.title}</h3>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {item.isRequired ? "Обязательный опрос" : "Дополнительный опрос"}
            {item.surveyTemplate ? ` · вопросов: ${item.surveyTemplate.questions.length}` : ""}
          </p>
        </div>
        <Badge tone={badgeTone}>{badgeLabel}</Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-[var(--ink-muted)]">
          {responseSent ? "Можно открыть и обновить ответы." : "Опрос откроется в отдельном окне прохождения."}
        </div>
        {canOpenSurvey && isAvailable ? (
          <Link
            href={appendCourseReturnSource(`/courses/${courseId}/survey/${item.id}`, returnSource)}
            prefetch={false}
            className={buttonStyles("primary")}
          >
            {responseSent ? "Открыть ответы" : "Пройти опрос"}
          </Link>
        ) : (
          <span className="text-sm text-[var(--ink-muted)]">Опрос доступен назначенным сотрудникам</span>
        )}
      </div>
    </Card>
  );
}
