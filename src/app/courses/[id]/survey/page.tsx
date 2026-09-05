import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { submitCourseSurvey } from "@/app/actions/course-survey-actions";
import { CoursePortalFrame } from "@/components/CoursePortalFrame";
import { CourseSurveyForm } from "@/components/CourseSurveyForm";
import { isUserAssignedToCourse } from "@/lib/access";
import { isPublishedSnapshotActive, parsePublishedCourseSnapshot } from "@/lib/course-content";
import { getCourseProgress } from "@/lib/course-progress";
import {
  appendCourseReturnSource,
  getCourseBackLink,
  getCourseReturnSource,
} from "@/lib/course-return-source";
import { formatCourseSurveyTitle, parseCourseSurveyQuestionOptionsJson } from "@/lib/course-surveys";
import { getPlatformSettings } from "@/lib/platform-settings";
import prisma from "@/lib/prisma";
import { ROLES, canTrackMaterialProgress, hasRole } from "@/lib/roles";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ survey?: string; from?: string }>;
};

export const dynamic = "force-dynamic";

export default async function CourseSurveyPage({ params, searchParams }: Props) {
  const [{ id: courseId }, sp] = await Promise.all([params, searchParams]);
  const returnSource = getCourseReturnSource(sp.from);

  const session = await auth();
  if (!session?.user) redirect("/login");

  const isStudent =
    hasRole(session.user.roles, ROLES.STUDENT) &&
    canTrackMaterialProgress(session.user.roles, session.user.permissions);
  if (!isStudent) {
    redirect(appendCourseReturnSource(`/courses/${courseId}`, returnSource));
  }

  const [settings, allowed] = await Promise.all([
    getPlatformSettings(),
    isUserAssignedToCourse(session.user.id, courseId),
  ]);

  if (!allowed) {
    redirect(appendCourseReturnSource(`/courses/${courseId}`, returnSource));
  }

  const course = await prisma.course.findUnique({
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
          surveyTemplate: {
            select: {
              isActive: true,
              questions: {
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
      feedbacks: {
        where: { status: "PUBLISHED" },
        select: { rating: true },
      },
      surveyTemplate: {
        include: {
          questions: {
            orderBy: { orderIndex: "asc" },
          },
          responses: {
            where: { userId: session.user.id },
            take: 1,
            include: {
              answers: true,
            },
          },
        },
      },
    },
  });

  if (!course) notFound();
  if (course.status !== "PUBLISHED") redirect("/");
  const firstCourseItemSurvey = course.items.find(
    (item) =>
      item.type === "SURVEY" &&
      item.surveyTemplate?.isActive &&
      item.surveyTemplate.questions.length > 0
  );
  if (firstCourseItemSurvey) {
    redirect(
      appendCourseReturnSource(`/courses/${courseId}/survey/${firstCourseItemSurvey.id}`, returnSource)
    );
  }
  if (!course.surveyTemplate?.isActive || course.surveyTemplate.questions.length === 0) {
    redirect(appendCourseReturnSource(`/courses/${courseId}`, returnSource));
  }

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

  const existingResponse = course.surveyTemplate.responses[0] ?? null;
  const existingAnswers = Object.fromEntries(
    (existingResponse?.answers ?? []).map((answer) => [
      answer.questionId,
      {
        ratingValue: answer.ratingValue,
        textValue: answer.textValue,
      },
    ])
  );
  const backLink = getCourseBackLink(returnSource);

  return (
    <main className="mx-auto max-w-6xl">
      <CoursePortalFrame
        courseId={courseId}
        active="survey"
        showFeedback={settings.feedbackEnabled}
        feedbackCount={settings.feedbackEnabled ? course.feedbacks.length : 0}
        showSurvey
        title={displayCourse.title}
        description={displayCourse.description || "Описание курса пока не заполнено."}
        coverUrl={displayCourse.coverUrl}
        backHref={backLink.href}
        backLabel={backLink.label}
        returnSource={returnSource}
        hideHero
        actions={
          <Link
            href={appendCourseReturnSource(`/courses/${courseId}`, returnSource)}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-white/90"
          >
            Вернуться к курсу
          </Link>
        }
      >
        <div className="space-y-4">
          {sp.survey === "locked" ? (
            <div className="rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning)]">
              Опрос доступен после полного завершения курса.
            </div>
          ) : null}

          {!progress.isCompleted ? (
            <section className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm">
              <p className="text-sm text-[var(--ink-muted)]">
                Сначала завершите все обязательные этапы курса, после этого опрос станет доступен для заполнения.
              </p>
            </section>
          ) : (
            <CourseSurveyForm
              introTitle={formatCourseSurveyTitle(course.surveyTemplate.title)}
              introDescription={course.surveyTemplate.description}
              introImageUrl={course.surveyTemplate.introImageUrl}
              submitAction={submitCourseSurvey.bind(null, courseId)}
              questions={course.surveyTemplate.questions.map((question) => ({
                id: question.id,
                title: question.title,
                type: (question.type === "RATING_5" || question.type === "SINGLE_CHOICE"
                  ? question.type
                  : "TEXT") as "RATING_5" | "SINGLE_CHOICE" | "TEXT",
                isRequired: question.isRequired,
                options: parseCourseSurveyQuestionOptionsJson(question.optionsJson),
              }))}
              existingAnswers={existingAnswers}
              submitLabel="Отправить опрос"
              saved={sp.survey === "saved"}
              locked={Boolean(existingResponse)}
            />
          )}
        </div>
      </CoursePortalFrame>
    </main>
  );
}
