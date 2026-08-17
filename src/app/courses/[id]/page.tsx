import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClipboardCheck, ClipboardList, FileText, Film, Files } from "lucide-react";
import { auth } from "@/auth";
import { CourseLessonTracker } from "@/components/CourseLessonTracker";
import { CoursePortalFrame } from "@/components/CoursePortalFrame";
import { MaterialView } from "@/components/MaterialView";
import { canManageCourse, canViewCourseContent, hasAnyCourseAssignment } from "@/lib/access";
import { resolveEffectiveCourseAccessWindow, type CourseAccessWindow } from "@/lib/course-access-window";
import { getCourseDeadlineMeta } from "@/lib/course-deadline";
import {
  appendCourseReturnSource,
  getCourseBackLink,
  getCourseReturnSource,
  type CourseReturnSource,
} from "@/lib/course-return-source";
import {
  buildCourseModuleGroups,
  isPublishedSnapshotActive,
  parsePublishedCourseSnapshot,
} from "@/lib/course-content";
import { buildCourseOutline, pickActiveCourseOutlineEntry, type CourseOutlineEntry } from "@/lib/course-navigation";
import { getCourseProgress, getQuizProgress } from "@/lib/course-progress";
import { getRequiredCorrectAnswers } from "@/lib/quiz-pass-rule";
import { normalizePresentationViewMode } from "@/lib/constants";
import { getPlatformSettings } from "@/lib/platform-settings";
import prisma from "@/lib/prisma";
import {
  PERMISSIONS,
  ROLES,
  canTrackMaterialProgress,
  canTrackLearningProgress,
  hasPermission,
  hasRole,
  isPlatformAdminRole,
} from "@/lib/roles";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ feedback?: string; item?: string; view?: string; resume?: string; from?: string; asLearner?: string }>;
};

export default async function CoursePage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const returnSource = getCourseReturnSource(sp.from);
  const backLink = getCourseBackLink(returnSource);

  const session = await auth();
  if (!session?.user) redirect("/login");

  const [allowed, hasAssignment] = await Promise.all([
    canViewCourseContent(
      session.user.id,
      session.user.roles,
      id,
      session.user.permissions
    ),
    hasAnyCourseAssignment(session.user.id, id),
  ]);
  if (!allowed) {
    if (hasAssignment) {
      const params = new URLSearchParams();
      if (returnSource) params.set("from", returnSource);
      const suffix = params.toString();
      redirect(suffix ? `/courses/${id}/about?${suffix}` : `/courses/${id}/about`);
    }
    redirect(returnSource === "catalog" ? `/courses/${id}/about?from=catalog` : "/");
  }

  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      modules: {
        where: { archivedAt: null },
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          orderIndex: true,
        },
      },
      items: {
        where: { archivedAt: null },
        orderBy: { orderIndex: "asc" },
        include: {
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
              id: true,
              progressPercent: true,
              maxPageSeen: true,
              totalPages: true,
              viewedAt: true,
            },
            take: 1,
          },
          quiz: {
            include: {
              questions: {
                where: { archivedAt: null },
                select: { id: true },
              },
              attempts: {
                where: { userId: session.user.id },
                orderBy: { attemptNumber: "asc" },
              },
            },
          },
          surveyTemplate: {
            select: {
              id: true,
              title: true,
              isActive: true,
              questions: {
                select: { id: true },
              },
              responses: {
                where: { userId: session.user.id },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
      feedbacks: {
        where: { userId: session.user.id },
        select: { id: true, rating: true, status: true },
      },
      surveyTemplate: {
        select: {
          id: true,
          isActive: true,
          responses: {
            where: { userId: session.user.id },
            select: { id: true },
            take: 1,
          },
        },
      },
      learnerStates: {
        where: { userId: session.user.id },
        select: { lastOpenedCourseItemId: true },
        take: 1,
      },
      directAssignments: {
        where: { userId: session.user.id },
        select: { expiresAt: true },
      },
      groupAssignments: {
        select: {
          expiresAt: true,
          group: {
            select: {
              memberships: {
                where: { userId: session.user.id },
                select: { userId: true },
              },
            },
          },
        },
      },
    },
  });

  if (!course) notFound();
  const platformSettings = await getPlatformSettings();

  const canEditCourse =
    hasPermission(session.user.roles, PERMISSIONS.COURSES_CREATE_EDIT, session.user.permissions) &&
    canManageCourse(session.user.roles, session.user.id, {
      ownerId: course.ownerId,
    });
  const canPublishCourse =
    hasPermission(session.user.roles, PERMISSIONS.COURSES_PUBLISH, session.user.permissions) &&
    canManageCourse(session.user.roles, session.user.id, {
      ownerId: course.ownerId,
    });
  const canManageAssignments = hasPermission(
    session.user.roles,
    PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
    session.user.permissions
  );
  const canOpenManageWorkspace = canEditCourse || canPublishCourse || canManageAssignments;
  const asLearnerPreview = canOpenManageWorkspace && sp.asLearner === "1";

  if (canOpenManageWorkspace && sp.view !== "content") {
    redirect(`/courses/${id}/manage`);
  }

  if (!isPlatformAdminRole(session.user.roles) && course.status !== "PUBLISHED") redirect("/");

  const canTakeKnowledgeCheck = canTrackLearningProgress(
    session.user.roles,
    session.user.permissions
  );
  const canStudyMaterials = canTrackMaterialProgress(
    session.user.roles,
    session.user.permissions
  );
  const isStudent = canStudyMaterials && hasRole(session.user.roles, ROLES.STUDENT);
  const showFeedbackTab = platformSettings.feedbackEnabled && isStudent && !asLearnerPreview;
  const showSurveyTab = false;
  const hasSurveyResponse = Boolean(course.surveyTemplate?.responses[0]);
  const feedbackCount = showFeedbackTab
    ? await prisma.courseFeedback.count({
        where: {
          courseId: course.id,
          status: "PUBLISHED",
        },
      })
    : 0;
  const showPublishedSnapshot = (!canOpenManageWorkspace || asLearnerPreview) && isPublishedSnapshotActive(course);
  const isLearnerFacingView =
    asLearnerPreview ||
    !canOpenManageWorkspace ||
    returnSource === "assigned" ||
    returnSource === "catalog";
  const publishedSnapshot = showPublishedSnapshot
    ? parsePublishedCourseSnapshot(course.publishedSnapshotJson)
    : null;
  const publishedItemIds = publishedSnapshot?.items.map((item) => item.id) ?? [];
  const publishedLiveItems =
    publishedItemIds.length > 0
      ? await prisma.courseItem.findMany({
          where: {
            id: { in: publishedItemIds },
          },
          include: {
            views: {
              where: { userId: session.user.id },
              select: {
                id: true,
                progressPercent: true,
                maxPageSeen: true,
                totalPages: true,
                viewedAt: true,
              },
              take: 1,
            },
            quiz: {
              include: {
                attempts: {
                  where: { userId: session.user.id },
                  orderBy: { attemptNumber: "asc" },
                },
              },
            },
            surveyTemplate: {
              select: {
                id: true,
                title: true,
                isActive: true,
                questions: {
                  select: { id: true },
                },
                responses: {
                  where: { userId: session.user.id },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
        })
      : [];
  const publishedLiveItemsById = new Map(publishedLiveItems.map((item) => [item.id, item]));

  const displayModules = publishedSnapshot?.modules ?? course.modules;
  const displayCourse = {
    title: publishedSnapshot?.title ?? course.title,
    description: publishedSnapshot?.description ?? course.description,
    coverUrl: publishedSnapshot?.coverUrl ?? course.coverUrl,
    navigationMode: publishedSnapshot?.navigationMode ?? course.navigationMode,
    quizGateMode: publishedSnapshot?.quizGateMode ?? course.quizGateMode,
  };
  const displayItems = publishedSnapshot
    ? publishedSnapshot.items.map((item) => {
        const liveItem = publishedLiveItemsById.get(item.id);
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
            item.moduleId ? displayModules.find((module) => module.id === item.moduleId) ?? null : null,
          views: liveItem?.views ?? [],
          quiz: item.quiz
            ? {
                id: item.quiz.id,
                description: item.quiz.description,
                maxAttempts: item.quiz.maxAttempts,
                minCorrectAnswers: item.quiz.minCorrectAnswers,
                lockMaterialsOnStart: item.quiz.lockMaterialsOnStart,
                questionPoolSize: item.quiz.questionPoolSize,
                retryDelayMinutes: item.quiz.retryDelayMinutes,
                trackSecurityEvents: item.quiz.trackSecurityEvents,
                questions: item.quiz.questions,
                attempts: liveItem?.quiz?.attempts ?? [],
              }
            : null,
          surveyTemplate: liveItem?.surveyTemplate ?? null,
        };
      })
    : course.items;
  const navigationMode = displayCourse.navigationMode === "SEQUENTIAL" ? "SEQUENTIAL" : "FREE";
  const quizGateMode = displayCourse.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED";

  const progress = getCourseProgress({
    courseTitle: displayCourse.title,
    courseDescription: displayCourse.description,
    quizGateMode,
    items: displayItems.map((item) => ({
      ...item,
      viewed: item.type === "QUIZ" ? false : item.views.length > 0,
      materialProgress: item.type === "QUIZ" ? 0 : item.views[0]?.progressPercent ?? 0,
    })),
  });
  const learnerAccessWindow = isStudent
    ? resolveEffectiveCourseAccessWindow(
        course.directAssignments.map((assignment) => assignment.expiresAt),
        course.groupAssignments
          .filter((assignment) => assignment.group.memberships.length > 0)
          .map((assignment) => assignment.expiresAt)
      )
    : null;

  const outline = buildCourseOutline(displayItems, navigationMode, {
    lockQuizzesUntilPreviousRequiredComplete: canTakeKnowledgeCheck || asLearnerPreview,
    lockMaterialsWhenQuizStarted: canTakeKnowledgeCheck || asLearnerPreview,
    quizGateMode,
  });
  const outlineGroups = buildCourseModuleGroups({
    modules: displayModules,
    items: outline,
    includeEmptyModules: false,
  });
  const requestedItemId = typeof sp.item === "string" ? sp.item : null;
  const requestedOutlineEntry = requestedItemId
    ? outline.find((item) => item.id === requestedItemId) ?? null
    : null;
  const lastOpenedItemId = course.learnerStates[0]?.lastOpenedCourseItemId ?? null;
  const recommendedEntry = pickActiveCourseOutlineEntry(outline, {
    lastOpenedItemId,
  });
  const activeEntry = pickActiveCourseOutlineEntry(outline, {
    requestedItemId,
    lastOpenedItemId,
  });
  const activeCourseItem = activeEntry
    ? displayItems.find((item) => item.id === activeEntry.id) ?? null
    : null;
  const activeIndex = activeEntry ? outline.findIndex((item) => item.id === activeEntry.id) : -1;
  const nextEntry = activeIndex >= 0 ? outline[activeIndex + 1] ?? null : null;
  const hasQuizItems = outline.some((item) => item.type === "QUIZ");
  const requestedItemLocked = Boolean(requestedOutlineEntry?.isLocked);
  const contentBaseHref = buildCourseItemHref(course.id, null, sp.view, returnSource, asLearnerPreview);
  const completionHref = nextEntry
    ? buildCourseEntryHref(course.id, nextEntry, sp.view, returnSource, asLearnerPreview)
    : undefined;
  const courseCompletionHref = !hasQuizItems && activeIndex >= 0 && !nextEntry ? contentBaseHref : undefined;
  const shouldAutoOpenActiveMaterial = sp.resume === "1" && requestedItemId === activeEntry?.id;

  if (shouldAutoOpenActiveMaterial && activeCourseItem?.type === "QUIZ" && activeCourseItem.quiz) {
    redirect(`/courses/${course.id}/quiz/${activeCourseItem.quiz.id}`);
  }
  if (shouldAutoOpenActiveMaterial && activeCourseItem?.type === "SURVEY" && !asLearnerPreview) {
    redirect(appendCourseReturnSource(`/courses/${course.id}/survey/${activeCourseItem.id}`, returnSource));
  }

  return (
    <main className="mx-auto max-w-6xl">
      <CoursePortalFrame
        courseId={course.id}
        active="content"
        contentHref={contentBaseHref}
        showFeedback={showFeedbackTab}
        feedbackCount={feedbackCount}
        showSurvey={showSurveyTab}
        title={displayCourse.title}
        description={displayCourse.description}
        coverUrl={displayCourse.coverUrl}
        backHref={backLink.href}
        backLabel={backLink.label}
        returnSource={returnSource}
        heroExtra={isStudent ? (
          <CourseDeadlineStrip accessWindow={learnerAccessWindow} isCompleted={progress.percent === 100} />
        ) : null}
        actions={
          canOpenManageWorkspace ? (
            <Link
              href={`/courses/${id}/manage`}
              className="inline-flex h-9 items-center rounded-md border border-white/25 px-3 text-sm font-medium text-white hover:bg-white/10"
            >
              Управление курсом
            </Link>
          ) : null
        }
      >
        <div className="space-y-4">
          {asLearnerPreview ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              Режим просмотра как ученик. Прогресс и попытки тестов администратора не изменяются, материалы показаны с учетом опубликованной версии.
            </div>
          ) : null}

          {requestedItemLocked ? (
            <p className="rounded-md border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {requestedOutlineEntry?.lockReason === "QUIZ_STARTED"
                ? "Просмотр материалов заблокирован, пока вы не завершите начатый тест."
                : "Этот урок пока заблокирован. Сначала завершите предыдущий обязательный этап."}
            </p>
          ) : null}

          <NextStepCard
            courseId={course.id}
            entry={recommendedEntry}
            isCourseCompleted={progress.percent >= 100}
            showFeedbackCta={showFeedbackTab}
            showSurveyCta={showSurveyTab && progress.percent >= 100 && !hasSurveyResponse}
            view={sp.view}
            returnSource={returnSource}
            asLearnerPreview={asLearnerPreview}
          />

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-zinc-950">Содержание курса</h2>
              <span className="text-sm text-zinc-500">
                {progress.completedRequired}/{progress.requiredTotal} завершено
              </span>
            </div>

            {outline.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-700">Элементы курса еще не добавлены.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {outlineGroups.map((group, groupIndex) => (
                  <section key={group.id ?? `outline-group-${groupIndex}`}>
                    {outlineGroups.length > 1 || group.description ? (
                      <div className="mb-2">
                        <h3 className="text-sm font-semibold text-zinc-900">{group.title}</h3>
                        {group.description ? (
                          <p className="mt-1 text-xs text-zinc-500">{group.description}</p>
                        ) : null}
                      </div>
                    ) : null}

                    <ol className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200">
                      {group.items.map((item) => (
                        <CourseContentListItem
                          key={item.id}
                          courseId={course.id}
                          item={item}
                          isActive={activeEntry?.id === item.id}
                          view={sp.view}
                          returnSource={returnSource}
                          asLearnerPreview={asLearnerPreview}
                        />
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            )}
          </section>

          {requestedItemId && activeEntry && activeCourseItem && !activeEntry.isLocked ? (
            <div id="lesson-content" className="scroll-mt-24">
              {isStudent && !asLearnerPreview ? (
                <CourseLessonTracker
                  courseId={course.id}
                  courseItemId={activeEntry.id}
                  enabled={isStudent}
                />
              ) : null}

              {activeCourseItem.type === "QUIZ" && activeCourseItem.quiz ? (
                <QuizCard
                  courseId={course.id}
                  item={{
                    id: activeCourseItem.id,
                    title: activeCourseItem.title,
                    isRequired: activeCourseItem.isRequired,
                    quiz: activeCourseItem.quiz,
                  }}
                  quizStatus={getQuizProgress(activeCourseItem.quiz, activeCourseItem.quiz.attempts)}
                  canOpenQuiz={canTakeKnowledgeCheck && !asLearnerPreview}
                  returnSource={returnSource}
                />
              ) : activeCourseItem.type === "SURVEY" ? (
                <SurveyCard
                  courseId={course.id}
                  item={{
                    id: activeCourseItem.id,
                    title: activeCourseItem.title,
                    isRequired: activeCourseItem.isRequired,
                    surveyTemplate: activeCourseItem.surveyTemplate ?? null,
                  }}
                  canOpenSurvey={canStudyMaterials && !asLearnerPreview}
                  returnSource={returnSource}
                />
              ) : (
                <MaterialView
                  courseTitle={course.title}
                  role={session.user.roles}
                  permissions={session.user.permissions}
                  item={activeCourseItem}
                  initialView={activeCourseItem.views[0] ?? null}
                  autoOpen={shouldAutoOpenActiveMaterial}
                  closeHref={shouldAutoOpenActiveMaterial ? contentBaseHref : undefined}
                  completionHref={completionHref}
                  completionType={nextEntry?.type}
                  completionTitle={nextEntry?.title}
                  courseCompletionHref={courseCompletionHref}
                  canSwitchPresentationPreview={!isLearnerFacingView && (canEditCourse || canPublishCourse)}
                  canTrackProgressOverride={!asLearnerPreview && canStudyMaterials}
                />
              )}
            </div>
          ) : null}
        </div>
      </CoursePortalFrame>
    </main>
  );
}

function CourseDeadlineStrip({
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

function buildCourseItemHref(
  courseId: string,
  itemId: string | null,
  view: string | undefined,
  returnSource: CourseReturnSource | null,
  asLearnerPreview = false
) {
  const params = new URLSearchParams();
  if (itemId) params.set("item", itemId);
  if (view) params.set("view", view);
  if (returnSource) params.set("from", returnSource);
  if (asLearnerPreview) params.set("asLearner", "1");
  const suffix = params.toString();
  return suffix ? `/courses/${courseId}?${suffix}` : `/courses/${courseId}`;
}

function buildCourseEntryResumeHref(
  courseId: string,
  entry: CourseOutlineEntry,
  view: string | undefined,
  returnSource: CourseReturnSource | null,
  asLearnerPreview = false
) {
  if (entry.type === "QUIZ" && entry.quiz?.id) {
    if (asLearnerPreview) return `/courses/${courseId}/quiz/${entry.quiz.id}/builder/preview`;
    return appendCourseReturnSource(`/courses/${courseId}/quiz/${entry.quiz.id}`, returnSource);
  }
  if (entry.type === "SURVEY") {
    if (asLearnerPreview) return buildCourseItemHref(courseId, entry.id, view, returnSource, true);
    return appendCourseReturnSource(`/courses/${courseId}/survey/${entry.id}`, returnSource);
  }

  const params = new URLSearchParams();
  params.set("item", entry.id);
  params.set("resume", "1");
  if (view) params.set("view", view);
  if (returnSource) params.set("from", returnSource);
  if (asLearnerPreview) params.set("asLearner", "1");
  return `/courses/${courseId}?${params.toString()}`;
}

function buildCourseEntryHref(
  courseId: string,
  entry: CourseOutlineEntry,
  view: string | undefined,
  returnSource: CourseReturnSource | null,
  asLearnerPreview = false
) {
  if (entry.type === "QUIZ" && entry.quiz?.id) {
    if (asLearnerPreview) return `/courses/${courseId}/quiz/${entry.quiz.id}/builder/preview`;
    return appendCourseReturnSource(`/courses/${courseId}/quiz/${entry.quiz.id}`, returnSource);
  }
  if (entry.type === "SURVEY") {
    if (asLearnerPreview) return buildCourseItemHref(courseId, entry.id, view, returnSource, true);
    return appendCourseReturnSource(`/courses/${courseId}/survey/${entry.id}`, returnSource);
  }
  return buildCourseItemHref(courseId, entry.id, view, returnSource, asLearnerPreview);
}

function NextStepCard({
  courseId,
  entry,
  isCourseCompleted,
  showFeedbackCta,
  showSurveyCta,
  view,
  returnSource,
  asLearnerPreview,
}: {
  courseId: string;
  entry: CourseOutlineEntry | null;
  isCourseCompleted: boolean;
  showFeedbackCta: boolean;
  showSurveyCta: boolean;
  view: string | undefined;
  returnSource: CourseReturnSource | null;
  asLearnerPreview: boolean;
}) {
  if (isCourseCompleted) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Курс завершен
            </p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-950">Все обязательные этапы пройдены</h2>
            {showSurveyCta ? (
              <p className="mt-2 text-sm text-zinc-600">Осталось пройти короткий опрос по результатам обучения.</p>
            ) : null}
          </div>
          {showSurveyCta ? (
            <Link
              href={appendCourseReturnSource(`/courses/${courseId}/survey`, returnSource)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Пройти опрос
            </Link>
          ) : showFeedbackCta ? (
            <Link
              href={appendCourseReturnSource(`/courses/${courseId}/feedback`, returnSource)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Оценить курс
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  if (!entry) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">Следующий шаг</h2>
        <p className="mt-2 text-sm text-zinc-600">В курсе пока нет материалов для прохождения.</p>
      </section>
    );
  }

  const isStarted = entry.progressPercent > 0;
  const attemptsLabel = entry.type === "QUIZ" ? getQuizAttemptsLabel(entry.quiz) : null;
  const showProgress = entry.type !== "QUIZ" && isStarted && entry.progressPercent < 100;
  const showStatusSummary = !showProgress || Boolean(attemptsLabel);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Следующий шаг
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold text-zinc-950">{entry.title}</h2>
          {showStatusSummary ? (
            <p className="mt-1 text-sm text-zinc-600">
              {entry.statusLabel}
              {attemptsLabel ? ` · ${attemptsLabel}` : ""}
            </p>
          ) : null}

          {showProgress ? (
            <div className="mt-3 max-w-xl">
              <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                <span>В процессе</span>
                <span>{entry.progressPercent}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-zinc-200">
                <div
                  className="h-1.5 rounded-full bg-teal-600 transition-all"
                  style={{ width: `${Math.max(0, Math.min(entry.progressPercent, 100))}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <Link
          href={buildCourseEntryResumeHref(courseId, entry, view, returnSource, asLearnerPreview)}
          prefetch={entry.type === "QUIZ" || entry.type === "SURVEY" ? false : undefined}
          className="inline-flex justify-center rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          {isStarted ? "Продолжить" : "Начать"}
        </Link>
      </div>
    </section>
  );
}

function CourseContentListItem({
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
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500"
        title={item.typeLabel}
        aria-label={item.typeLabel}
      >
        {getCourseItemRowIcon(item.type)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-950">{item.title}</p>
        <p className="mt-1 text-xs text-zinc-500">
          <span>Шаг {item.itemNumber}</span>
          <span> · {item.typeLabel}</span>
          {attemptsLabel ? <span> · {attemptsLabel}</span> : null}
        </p>
        {showProgress ? (
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 w-28 rounded-full bg-zinc-200">
              <div
                className="h-1.5 rounded-full bg-teal-600 transition-all"
                style={{ width: `${Math.max(0, Math.min(item.progressPercent, 100))}%` }}
              />
            </div>
            <span className="text-xs text-zinc-500">{item.progressPercent}%</span>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (item.isLocked) {
    return (
      <li className="flex items-center justify-between gap-3 bg-zinc-50 px-3 py-3 opacity-75">
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
          isActive ? "bg-sky-50" : "bg-white hover:bg-slate-50"
        }`}
      >
        {title}
        <div className="flex shrink-0 items-center gap-3">
          <CourseStatusPill
            label={item.statusLabel}
            tone={item.isCompleted ? "completed" : item.progressPercent > 0 ? "progress" : "idle"}
          />
          <span className="hidden text-sm font-semibold text-teal-700 sm:inline">
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
  const className =
    tone === "completed"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "progress"
        ? "bg-amber-50 text-amber-700"
        : tone === "locked"
          ? "bg-zinc-200 text-zinc-600"
          : "bg-slate-100 text-slate-600";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{label}</span>;
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

function QuizCard({
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
  const badgeStyles =
    quizStatus.status.code === "PASSED"
      ? "bg-emerald-100 text-emerald-700"
      : quizStatus.status.code === "IN_PROGRESS"
        ? "bg-amber-100 text-amber-700"
        : quizStatus.status.code === "FAILED"
          ? "bg-red-100 text-red-700"
          : "bg-zinc-100 text-zinc-700";
  const requiredCorrectAnswers = getRequiredCorrectAnswers(
    item.quiz.minCorrectAnswers,
    item.quiz.questions.length
  );
  const attemptsLabel = getQuizAttemptsLabel(item.quiz);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900">{item.title}</h3>
          <p className="mt-2 text-sm text-zinc-700">
            {item.isRequired ? "Обязательный тест" : "Дополнительный тест"} · минимум правильных
            ответов: {requiredCorrectAnswers}
            {attemptsLabel ? ` · ${attemptsLabel}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeStyles}`}>
          {quizStatus.status.label}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-500">
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
            className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            Открыть тест
          </Link>
        ) : (
          <span className="text-sm text-zinc-500">Тест доступен назначенным сотрудникам</span>
        )}
      </div>
    </div>
  );
}

function SurveyCard({
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
  const badgeStyles = responseSent
    ? "bg-emerald-100 text-emerald-700"
    : isAvailable
      ? "bg-sky-100 text-sky-700"
      : "bg-zinc-100 text-zinc-700";
  const badgeLabel = responseSent ? "Ответ отправлен" : isAvailable ? "Не пройден" : "Не настроен";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900">{item.title}</h3>
          <p className="mt-2 text-sm text-zinc-700">
            {item.isRequired ? "Обязательный опрос" : "Дополнительный опрос"}
            {item.surveyTemplate ? ` · вопросов: ${item.surveyTemplate.questions.length}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeStyles}`}>
          {badgeLabel}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-500">
          {responseSent ? "Можно открыть и обновить ответы." : "Опрос откроется в отдельном окне прохождения."}
        </div>
        {canOpenSurvey && isAvailable ? (
          <Link
            href={appendCourseReturnSource(`/courses/${courseId}/survey/${item.id}`, returnSource)}
            prefetch={false}
            className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            {responseSent ? "Открыть ответы" : "Пройти опрос"}
          </Link>
        ) : (
          <span className="text-sm text-zinc-500">Опрос доступен назначенным сотрудникам</span>
        )}
      </div>
    </div>
  );
}
