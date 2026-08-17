import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { submitCourseItemSurvey } from "@/app/actions/course-survey-actions";
import { CoursePortalFrame } from "@/components/CoursePortalFrame";
import { CourseSurveyForm } from "@/components/CourseSurveyForm";
import { isUserAssignedToCourse } from "@/lib/access";
import { buildCourseOutline } from "@/lib/course-navigation";
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
  params: Promise<{ id: string; itemId: string }>;
  searchParams: Promise<{ survey?: string; from?: string }>;
};

export const dynamic = "force-dynamic";

export default async function CourseItemSurveyPage({ params, searchParams }: Props) {
  const [{ id: courseId, itemId }, sp] = await Promise.all([params, searchParams]);
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
    select: {
      id: true,
      title: true,
      description: true,
      coverUrl: true,
      status: true,
      navigationMode: true,
      quizGateMode: true,
      feedbacks: {
        where: { status: "PUBLISHED" },
        select: { rating: true },
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
                include: {
                  answers: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!course) notFound();
  if (course.status !== "PUBLISHED") redirect("/");

  const surveyItem = course.items.find((item) => item.id === itemId) ?? null;
  if (!surveyItem || surveyItem.type !== "SURVEY" || !surveyItem.surveyTemplate?.isActive) {
    redirect(appendCourseReturnSource(`/courses/${courseId}`, returnSource));
  }

  const outline = buildCourseOutline(
    course.items,
    course.navigationMode === "SEQUENTIAL" ? "SEQUENTIAL" : "FREE",
    {
      lockQuizzesUntilPreviousRequiredComplete: true,
      lockMaterialsWhenQuizStarted: true,
      quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
    }
  );
  const surveyEntry = outline.find((item) => item.id === itemId) ?? null;
  if (surveyEntry?.isLocked) {
    redirect(appendCourseReturnSource(`/courses/${courseId}?item=${itemId}`, returnSource));
  }

  const template = surveyItem.surveyTemplate;
  if (template.questions.length === 0) {
    redirect(appendCourseReturnSource(`/courses/${courseId}`, returnSource));
  }

  const existingResponse = template.responses[0] ?? null;
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
  const contentHref = `/courses/${courseId}?item=${itemId}`;

  return (
    <main className="mx-auto max-w-6xl">
      <CoursePortalFrame
        courseId={courseId}
        active="content"
        contentHref={contentHref}
        showFeedback={settings.feedbackEnabled}
        feedbackCount={settings.feedbackEnabled ? course.feedbacks.length : 0}
        showSurvey={false}
        title={course.title}
        description={course.description || "Описание курса пока не заполнено."}
        coverUrl={course.coverUrl}
        backHref={backLink.href}
        backLabel={backLink.label}
        returnSource={returnSource}
        hideHero
        actions={
          <Link
            href={appendCourseReturnSource(contentHref, returnSource)}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white/90"
          >
            Вернуться к содержанию
          </Link>
        }
      >
        <div className="space-y-4">
          <CourseSurveyForm
            introTitle={formatCourseSurveyTitle(template.title)}
            introDescription={template.description}
            introImageUrl={template.introImageUrl}
            submitAction={submitCourseItemSurvey.bind(null, courseId, itemId)}
            questions={template.questions.map((question) => ({
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
        </div>
      </CoursePortalFrame>
    </main>
  );
}
