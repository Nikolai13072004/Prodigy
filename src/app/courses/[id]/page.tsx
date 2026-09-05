import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { CourseLessonTracker } from "@/components/CourseLessonTracker";
import { CoursePortalFrame } from "@/components/CoursePortalFrame";
import { MaterialView } from "@/components/MaterialView";
import { canManageCourse, canViewCourseContent, hasAnyCourseAssignment } from "@/lib/access";
import { resolveEffectiveCourseAccessWindow } from "@/lib/course-access-window";
import {
  appendCourseReturnSource,
  getCourseBackLink,
  getCourseReturnSource,
} from "@/lib/course-return-source";
import {
  buildCourseModuleGroups,
  isPublishedSnapshotActive,
  parsePublishedCourseSnapshot,
} from "@/lib/course-content";
import { buildCourseOutline, pickActiveCourseOutlineEntry } from "@/lib/course-navigation";
import { getCourseProgress, getQuizProgress } from "@/lib/course-progress";
import { findCourseCertificate } from "@/modules/certification/server/find-course-certificate";
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
import { buildCourseEntryHref, buildCourseItemHref } from "./_content/hrefs";
import {
  CourseContentListItem,
  CourseDeadlineStrip,
  NextStepCard,
  QuizCard,
  SurveyCard,
} from "./_content/cards";

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
  const courseCertificate = progress.isCompleted
    ? await findCourseCertificate(session.user.id, course.id)
    : null;
  const certificateSerial =
    courseCertificate?.status === "ISSUED" ? courseCertificate.serial : null;
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
            <div className="rounded-md bg-[var(--info-soft)] px-4 py-3 text-sm text-[var(--info)]">
              Режим просмотра как ученик. Прогресс и попытки тестов администратора не изменяются, материалы показаны с учетом опубликованной версии.
            </div>
          ) : null}

          {requestedItemLocked ? (
            <p className="rounded-md bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning)]">
              {requestedOutlineEntry?.lockReason === "QUIZ_STARTED"
                ? "Просмотр материалов заблокирован, пока вы не завершите начатый тест."
                : "Этот урок пока заблокирован. Сначала завершите предыдущий обязательный этап."}
            </p>
          ) : null}

          <NextStepCard
            courseId={course.id}
            entry={recommendedEntry}
            isCourseCompleted={progress.isCompleted}
            certificateSerial={certificateSerial}
            showFeedbackCta={showFeedbackTab}
            showSurveyCta={showSurveyTab && progress.isCompleted && !hasSurveyResponse}
            view={sp.view}
            returnSource={returnSource}
            asLearnerPreview={asLearnerPreview}
          />

          <section className="rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-[var(--ink)]">Содержание курса</h2>
              <span className="text-sm text-[var(--ink-muted)]">
                {progress.completedRequired}/{progress.requiredTotal} завершено
              </span>
            </div>

            {outline.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--ink-muted)]">Элементы курса еще не добавлены.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {outlineGroups.map((group, groupIndex) => (
                  <section key={group.id ?? `outline-group-${groupIndex}`}>
                    {outlineGroups.length > 1 || group.description ? (
                      <div className="mb-2">
                        <h3 className="text-sm font-semibold text-[var(--ink)]">{group.title}</h3>
                        {group.description ? (
                          <p className="mt-1 text-xs text-[var(--ink-muted)]">{group.description}</p>
                        ) : null}
                      </div>
                    ) : null}

                    <ol className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)]">
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
