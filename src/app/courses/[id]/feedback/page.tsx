import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { deleteMyCourseFeedback, submitFeedback } from "@/app/actions/course-feedback-actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { CourseFeedbackComposer } from "@/components/CourseFeedbackComposer";
import { CoursePortalFrame } from "@/components/CoursePortalFrame";
import { isUserAssignedToCourse } from "@/lib/access";
import { isPublishedSnapshotActive, parsePublishedCourseSnapshot } from "@/lib/course-content";
import { getCourseProgress } from "@/lib/course-progress";
import {
  appendCourseReturnSource,
  getCourseBackLink,
  getCourseReturnSource,
} from "@/lib/course-return-source";
import { getPlatformSettings } from "@/lib/platform-settings";
import prisma from "@/lib/prisma";
import { ROLES, canTrackMaterialProgress, hasRole } from "@/lib/roles";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ feedback?: string; edit?: string; from?: string }>;
};

export default async function FeedbackPage({ params, searchParams }: Props) {
  const [{ id: courseId }, sp] = await Promise.all([params, searchParams]);
  const returnSource = getCourseReturnSource(sp.from);

  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasRole(session.user.roles, ROLES.STUDENT) || !canTrackMaterialProgress(session.user.roles, session.user.permissions)) {
    redirect(appendCourseReturnSource(`/courses/${courseId}`, returnSource));
  }

  const [settings, allowed] = await Promise.all([
    getPlatformSettings(),
    isUserAssignedToCourse(session.user.id, courseId),
  ]);

  if (!settings.feedbackEnabled) redirect(appendCourseReturnSource(`/courses/${courseId}`, returnSource));

  const [course, existing] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
      include: {
        items: {
          where: { archivedAt: null },
          orderBy: { orderIndex: "asc" },
          include: {
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
        },
        feedbacks: {
          where: { status: "PUBLISHED" },
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: { name: true, login: true },
            },
          },
        },
        surveyTemplate: {
          select: {
            isActive: true,
          },
        },
      },
    }),
    prisma.courseFeedback.findUnique({
      where: {
        courseId_userId: {
          courseId,
          userId: session.user.id,
        },
      },
      select: { id: true, rating: true, comment: true, status: true, createdAt: true },
    }),
  ]);

  if (!course) notFound();
  if (course.status !== "PUBLISHED") redirect("/");

  const publishedSnapshot = isPublishedSnapshotActive(course)
    ? parsePublishedCourseSnapshot(course.publishedSnapshotJson)
    : null;
  const displayCourse = {
    title: publishedSnapshot?.title ?? course.title,
    description: publishedSnapshot?.description ?? course.description,
    coverUrl: publishedSnapshot?.coverUrl ?? course.coverUrl,
    quizGateMode: publishedSnapshot?.quizGateMode ?? course.quizGateMode,
  };
  const progress = getCourseProgress({
    courseTitle: displayCourse.title,
    courseDescription: displayCourse.description,
    quizGateMode: displayCourse.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
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
  const canLeaveFeedback = allowed && progress.percent >= 100;
  const averageRating = getAverageRating(course.feedbacks);
  const ratingSummary =
    averageRating === null
      ? `Оценок нет · ${course.feedbacks.length} ${pluralizeReviews(course.feedbacks.length)}`
      : `${averageRating.toFixed(1)} · ${course.feedbacks.length} ${pluralizeReviews(course.feedbacks.length)}`;
  const isEditingPublishedFeedback = existing?.status === "PUBLISHED" && sp.edit === "1";
  const showComposer =
    canLeaveFeedback && (!existing || existing.status === "PENDING" || isEditingPublishedFeedback);
  const backLink = getCourseBackLink(returnSource);

  return (
    <main className="mx-auto max-w-6xl">
      <CoursePortalFrame
        courseId={courseId}
        active="feedback"
        showFeedback
        feedbackCount={course.feedbacks.length}
        showSurvey={Boolean(course.surveyTemplate?.isActive)}
        title={displayCourse.title}
        description={displayCourse.description || "Описание курса пока не заполнено."}
        coverUrl={displayCourse.coverUrl}
        backHref={backLink.href}
        backLabel={backLink.label}
        contentDisabled={!allowed}
        returnSource={returnSource}
        actions={
          allowed ? (
            <Link
              href={appendCourseReturnSource(`/courses/${courseId}`, returnSource)}
              className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-white/90"
            >
              Перейти к обучению
            </Link>
          ) : (
            <span className="rounded-md border border-white/25 px-3 py-2 text-sm text-white/80">
              Доступ откроется после назначения
            </span>
          )
        }
      >
        <div className="space-y-4">
          {sp.feedback === "pending" ? (
            <p className="rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning)]">
              Отзыв сохранен и отправлен на модерацию.
            </p>
          ) : null}

          {sp.feedback === "locked" ? (
            <p className="rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning)]">
              Оставить отзыв можно после полного завершения курса.
            </p>
          ) : null}

          {sp.feedback === "deleted" ? (
            <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--ink)]">
              Отзыв удален. Вы можете оставить новый отзыв о курсе.
            </p>
          ) : null}

          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center gap-2 text-lg font-semibold text-[var(--ink)]">
              <span className="text-[var(--warning)]">★</span>
              <span>{ratingSummary}</span>
            </div>

            {showComposer ? (
              <div className="mt-5 flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-strong)] text-sm font-semibold text-white">
                  {initials(session.user.name || session.user.email || "У")}
                </div>
                <div className="min-w-0 flex-1">
                  <form action={submitFeedback.bind(null, courseId)} className="rounded-2xl border border-[var(--accent)] bg-[var(--surface-raised)] p-3 shadow-sm">
                    <CourseFeedbackComposer
                      defaultRating={existing?.rating ?? null}
                      defaultComment={existing?.comment ?? ""}
                    />
                  </form>
                  <p className="mt-3 rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs text-[var(--warning)]">
                    {existing?.status === "PENDING"
                      ? "Ваш текущий отзыв сохранен и ждет публикации после модерации."
                      : "После сохранения отзыв обновится для администратора и других учеников."}
                  </p>
                </div>
              </div>
            ) : !canLeaveFeedback ? (
              <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink-muted)]">
                {allowed
                  ? "Отзывы становятся доступны после завершения курса. Так оценка будет основана на полном опыте обучения."
                  : "Отзывы можно читать в каталоге, но оставить свой отзыв получится после назначения и полного прохождения курса."}
              </div>
            ) : null}

            <div className="mt-6 space-y-4">
              {course.feedbacks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-raised)] text-xl text-[var(--ink-muted)]">
                    ”
                  </div>
                  <p className="mt-3 text-sm font-medium text-[var(--ink)]">Отзывов пока нет</p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">Ваш отзыв может стать первым.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {course.feedbacks.map((feedback) => (
                    <li key={feedback.id} className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-strong)] text-sm font-semibold text-white">
                        {initials(feedback.user.name || feedback.user.login)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="max-w-3xl rounded-2xl bg-[var(--surface)] px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-[var(--ink)]">
                              {feedback.user.name || feedback.user.login}
                            </p>
                            <span className="text-xs text-[var(--ink-muted)]">{formatReviewRelativeDate(feedback.createdAt)}</span>
                          </div>
                          <div className="mt-1 text-lg leading-none text-[var(--warning)]">{"★".repeat(feedback.rating)}</div>
                          {feedback.comment ? (
                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--ink)]">{feedback.comment}</p>
                          ) : (
                            <p className="mt-2 text-sm text-[var(--ink-muted)]">Комментарий не добавлен.</p>
                          )}
                        </div>

                        {feedback.userId === session.user.id ? (
                          <div className="mt-2 flex flex-wrap items-center gap-4 pl-4 text-xs font-medium text-[var(--ink-muted)]">
                            <Link
                              href={appendCourseReturnSource(`/courses/${courseId}/feedback?edit=1`, returnSource)}
                              className="hover:text-[var(--ink)]"
                            >
                              Редактировать
                            </Link>
                            <form action={deleteMyCourseFeedback.bind(null, courseId)}>
                              <ConfirmSubmitButton
                                confirmMessage="Удалить ваш отзыв о курсе?"
                                className="hover:text-[var(--danger)]"
                              >
                                Удалить
                              </ConfirmSubmitButton>
                            </form>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {existing?.status === "PUBLISHED" && !isEditingPublishedFeedback ? (
            <p className="px-1 text-sm leading-6 text-[var(--ink)]">
              Вы можете в любой момент отредактировать текст отзыва, скорректировать оценку и удалить отзыв.
            </p>
          ) : null}
        </div>
      </CoursePortalFrame>
    </main>
  );
}

function getAverageRating(feedbacks: Array<{ rating: number }>) {
  if (feedbacks.length === 0) return null;
  return Number((feedbacks.reduce((sum, feedback) => sum + feedback.rating, 0) / feedbacks.length).toFixed(1));
}

function pluralizeReviews(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "отзыва";
  return "отзывов";
}

function initials(input: string) {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "У";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatReviewRelativeDate(value: Date) {
  const diffMs = Date.now() - value.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return "несколько секунд назад";
  if (diffMinutes < 60) return `${diffMinutes} ${pluralizeMinutes(diffMinutes)} назад`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ${pluralizeHours(diffHours)} назад`;
  return formatReviewDate(value);
}

function pluralizeMinutes(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "минуту";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "минуты";
  return "минут";
}

function pluralizeHours(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "час";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "часа";
  return "часов";
}

function formatReviewDate(value: Date) {
  return value.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
