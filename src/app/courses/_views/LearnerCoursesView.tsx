import Link from "next/link";
import { LearnerCourseSearch } from "@/components/LearnerCourseSearch";
import {
  COURSE_CATEGORY_OPTIONS,
  COURSE_DIFFICULTY_OPTIONS,
  formatCourseDuration,
  getCourseCategoryLabel,
  getCourseDifficultyLabel,
} from "@/lib/course-metadata";
import { resolveEffectiveCourseAccessWindow, type CourseAccessWindow } from "@/lib/course-access-window";
import { isPublishedSnapshotActive, parsePublishedCourseSnapshot } from "@/lib/course-content";
import { buildCourseOutline } from "@/lib/course-navigation";
import { getCourseProgress } from "@/lib/course-progress";
import type { CourseNavigationMode, CourseQuizGateMode } from "@/lib/constants";
import prisma from "@/lib/prisma";
import {
  ContinueLearningPanel,
  LearnerAccessBadge,
  LearnerAssignedCourseCard,
  LearnerCourseCover,
  LearnerCourseListItem,
  LearnerEmptyState,
  LearnerRatingBadge,
  LearnerTabLink,
  buildLearnerCourseAboutHref,
  buildLearnerCourseDetailsHref,
  buildLearnerCourseResumeHref,
  buildLearnerCourseSearchText,
  buildLearnerCoursesHref,
  compareLearnerCourses,
  getCourseAverageRating,
  getLearnerAssignmentSortMeta,
  getLearnerCourseLastActivityAt,
  getLearnerCourseState,
  getLearnerSearchTerms,
  learnerCourseAssignmentWhere,
  matchesLearnerCatalogDuration,
  matchesLearnerCatalogRating,
  matchesLearnerCourseSearch,
  pickLearnerResumeEntry,
} from "../_page-parts";

// Интерфейс ученика: назначенные курсы / каталог (fall-through-ветка).
// Вынесено из courses/page.tsx (ADR-013 IA-A).
export async function LearnerCoursesView({
  userId,
  q,
  learnerTab,
  hrCategory,
  hrDifficulty,
  learnerDuration,
  learnerRating,
  shouldUseLearnerCoursesView,
  feedbackEnabled,
  canTakeKnowledgeCheck,
}: {
  userId: string;
  q: string;
  learnerTab: "catalog" | "assigned" | "completed";
  hrCategory: string | undefined;
  hrDifficulty: string | undefined;
  learnerDuration: "all" | "short" | "medium" | "long";
  learnerRating: "all" | "4plus" | "3plus";
  shouldUseLearnerCoursesView: boolean;
  feedbackEnabled: boolean;
  canTakeKnowledgeCheck: boolean;
}) {

  const assignedCourses = await prisma.course.findMany({
    where: {
      status: "PUBLISHED",
      AND: [learnerCourseAssignmentWhere(userId)],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      directAssignments: {
        where: { userId: userId },
        select: { assignedAt: true, assignedById: true, expiresAt: true },
      },
      groupAssignments: {
        select: {
          assignedAt: true,
          assignedById: true,
          expiresAt: true,
          group: {
            select: {
              memberships: {
                where: { userId: userId },
                select: { userId: true },
              },
            },
          },
        },
      },
      learnerStates: {
        where: { userId: userId },
        select: { lastOpenedCourseItemId: true, updatedAt: true },
        take: 1,
      },
      items: {
        where: { archivedAt: null },
        orderBy: { orderIndex: "asc" },
        include: {
          views: {
            where: { userId: userId },
            select: { progressPercent: true, viewedAt: true },
            take: 1,
          },
          quiz: {
            include: {
              questions: {
                where: { archivedAt: null },
                select: { id: true },
              },
              attempts: {
                where: { userId: userId },
                orderBy: { attemptNumber: "asc" },
              },
            },
          },
        },
      },
    },
  });

  const rawCatalogCourses =
    learnerTab === "catalog"
      ? await prisma.course.findMany({
          where: {
            status: "PUBLISHED",
            ...(q
              ? {
                  OR: [{ title: { contains: q } }, { description: { contains: q } }],
                }
              : {}),
            ...(hrCategory ? { category: hrCategory } : {}),
            ...(hrDifficulty ? { difficultyLevel: hrDifficulty } : {}),
          },
          orderBy: [{ publishedAt: "desc" }, { title: "asc" }],
          include: {
            owner: {
              select: {
                name: true,
                login: true,
              },
            },
            feedbacks: {
              where: { status: "PUBLISHED" },
              select: {
                rating: true,
              },
            },
          },
        })
      : [];

  const now = new Date();
  const learnerCourses: LearnerCourseListItem[] = assignedCourses.map((course) => {
    const publishedSnapshot = isPublishedSnapshotActive(course)
      ? parsePublishedCourseSnapshot(course.publishedSnapshotJson)
      : null;
    const displayItems = publishedSnapshot?.items ?? course.items;
    const displayTitle = publishedSnapshot?.title ?? course.title;
    const displayDescription = publishedSnapshot?.description ?? course.description;
    const displayCategory = publishedSnapshot?.category ?? course.category;
    const displayDifficulty = publishedSnapshot?.difficultyLevel ?? course.difficultyLevel;
    const displayQuizGateMode: CourseQuizGateMode =
      (publishedSnapshot?.quizGateMode ?? course.quizGateMode) === "PASSED" ? "PASSED" : "RESOLVED";
    const displayNavigationMode: CourseNavigationMode =
      (publishedSnapshot?.navigationMode ?? course.navigationMode) === "SEQUENTIAL" ? "SEQUENTIAL" : "FREE";
    const displayItemsWithLearnerData = displayItems.map((item) => {
      const liveItem = course.items.find((candidate) => candidate.id === item.id) ?? null;

      return {
        ...item,
        views: liveItem?.views ?? [],
        quiz: item.type === "QUIZ"
          ? {
              id: item.quiz?.id ?? liveItem?.quiz?.id ?? "",
              description: item.quiz?.description ?? liveItem?.quiz?.description ?? null,
              attempts: liveItem?.quiz?.attempts ?? [],
              questions: item.quiz?.questions ?? liveItem?.quiz?.questions ?? [],
              maxAttempts: item.quiz?.maxAttempts ?? liveItem?.quiz?.maxAttempts ?? 1,
              minCorrectAnswers: item.quiz?.minCorrectAnswers ?? liveItem?.quiz?.minCorrectAnswers ?? 1,
              lockMaterialsOnStart: item.quiz?.lockMaterialsOnStart ?? liveItem?.quiz?.lockMaterialsOnStart ?? false,
            }
          : null,
        viewed: liveItem?.views.length ? true : false,
        materialProgress: liveItem?.views[0]?.progressPercent ?? 0,
      };
    });
    const progress = getCourseProgress({
      courseTitle: displayTitle,
      courseDescription: displayDescription,
      quizGateMode: displayQuizGateMode,
      items: displayItemsWithLearnerData.map((item) => ({
        ...item,
        viewed: item.type === "QUIZ" ? false : item.viewed,
      })),
    });
    const hasViews = course.items.some((item) => item.views.length > 0);
    const inheritedAssignments = course.groupAssignments.filter(
      (assignment) => assignment.group.memberships.length > 0
    );
    const accessWindow = resolveEffectiveCourseAccessWindow(
      course.directAssignments.map((assignment) => assignment.expiresAt),
      inheritedAssignments.map((assignment) => assignment.expiresAt),
      now
    );
    const assignmentMeta = getLearnerAssignmentSortMeta(
      course.directAssignments,
      inheritedAssignments,
      accessWindow
    );
    const outline = buildCourseOutline(displayItemsWithLearnerData, displayNavigationMode, {
      lockQuizzesUntilPreviousRequiredComplete: canTakeKnowledgeCheck,
      lockMaterialsWhenQuizStarted: canTakeKnowledgeCheck,
      quizGateMode: displayQuizGateMode,
    });
    const resumeEntry = pickLearnerResumeEntry(
      outline,
      course.learnerStates[0]?.lastOpenedCourseItemId ?? null
    );

    return {
      id: course.id,
      title: displayTitle,
      description: displayDescription,
      coverUrl: publishedSnapshot?.coverUrl ?? course.coverUrl,
      progress,
      hasViews,
      state: getLearnerCourseState(progress),
      accessWindow,
      canOpenCourse: accessWindow?.isActive ?? false,
      assignedAt: assignmentMeta.assignedAt,
      deadlineAt: assignmentMeta.deadlineAt,
      lastActivityAt: getLearnerCourseLastActivityAt(
        course.learnerStates[0]?.updatedAt ?? null,
        course.items
      ),
      isInstructorAssigned: assignmentMeta.hasInstructorAssignment,
      hasInstructorDeadline: assignmentMeta.hasInstructorDeadline,
      isSelfSelectedFromCatalog: assignmentMeta.isSelfSelectedFromCatalog,
      aboutHref: buildLearnerCourseAboutHref(course.id),
      detailsHref: buildLearnerCourseDetailsHref(course.id, shouldUseLearnerCoursesView),
      resumeHref: buildLearnerCourseResumeHref(course.id, resumeEntry, shouldUseLearnerCoursesView),
      searchText: buildLearnerCourseSearchText({
        title: displayTitle,
        description: displayDescription,
        category: displayCategory,
        difficultyLevel: displayDifficulty,
      }),
    };
  }).sort(compareLearnerCourses);

  const learnerSearchTerms = learnerTab === "catalog" ? [] : getLearnerSearchTerms(q);
  const isLearnerSearchActive = learnerSearchTerms.length > 0;
  const searchedLearnerCourses = isLearnerSearchActive
    ? learnerCourses.filter((course) => matchesLearnerCourseSearch(course, learnerSearchTerms))
    : learnerCourses;
  const assignedCount = learnerCourses.length;
  const completedCount = learnerCourses.filter((course) => course.state === "completed").length;
  const assignedInProgressCount = assignedCount - completedCount;
  const defaultContinueCourse = learnerCourses.find(
    (course) => course.canOpenCourse && course.state !== "completed"
  ) ?? null;
  const continueCourse = isLearnerSearchActive
    ? searchedLearnerCourses.find((course) => course.canOpenCourse && course.state !== "completed") ?? null
    : defaultContinueCourse;
  const visibleAssignedCourses =
    learnerTab === "completed"
      ? searchedLearnerCourses.filter((course) => course.state === "completed")
      : isLearnerSearchActive
      ? searchedLearnerCourses.filter((course) => course.id !== continueCourse?.id)
      : learnerCourses.filter((course) => course.state !== "completed" && course.id !== continueCourse?.id);
  const learnerStatesByCourseId = new Map<string, ReturnType<typeof getLearnerCourseState>>(
    learnerCourses.map((course) => [course.id, course.state] as const)
  );
  const learnerAccessByCourseId = new Map<string, CourseAccessWindow | null>(
    learnerCourses.map((course) => [course.id, course.accessWindow] as const)
  );
  const assignedCourseIds = new Set(learnerCourses.map((course) => course.id));
  const catalogCourses = rawCatalogCourses
    .filter((course) => !assignedCourseIds.has(course.id))
    .map((course) => {
      const publishedSnapshot = isPublishedSnapshotActive(course)
        ? parsePublishedCourseSnapshot(course.publishedSnapshotJson)
        : null;
      const averageRating = getCourseAverageRating(course.feedbacks);
      const displayTitle = publishedSnapshot?.title ?? course.title;
      const displayDescription = publishedSnapshot?.description ?? course.description;
      const displayDurationMinutes = publishedSnapshot?.durationMinutes ?? course.durationMinutes;
      const displayCategory = publishedSnapshot?.category ?? course.category;
      const displayDifficulty = publishedSnapshot?.difficultyLevel ?? course.difficultyLevel;

      return {
        id: course.id,
        title: displayTitle,
        description: displayDescription,
        coverUrl: publishedSnapshot?.coverUrl ?? course.coverUrl,
        durationMinutes: displayDurationMinutes,
        durationLabel: formatCourseDuration(displayDurationMinutes),
        authorName: course.owner?.name ?? course.owner?.login ?? "Не назначен",
        categoryLabel: getCourseCategoryLabel(displayCategory),
        difficultyLabel: getCourseDifficultyLabel(displayDifficulty),
        averageRating: feedbackEnabled ? averageRating : null,
        reviewsCount: feedbackEnabled ? course.feedbacks.length : 0,
        isAssigned: assignedCourseIds.has(course.id),
        learnerState: learnerStatesByCourseId.get(course.id) ?? null,
        accessWindow: learnerAccessByCourseId.get(course.id) ?? null,
      };
    })
    .filter(
      (course) =>
        matchesLearnerCatalogDuration(course.durationMinutes, learnerDuration) &&
        (!feedbackEnabled || matchesLearnerCatalogRating(course.averageRating, learnerRating))
    );

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-sm">
        <div className="border-b border-[var(--line)] bg-[var(--surface)] px-5 py-6 sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
                {learnerTab === "catalog" ? "Каталог курсов" : "Мои курсы"}
              </h1>
            </div>
          </div>
        </div>

        <div className="border-b border-[var(--line)] bg-white px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            {learnerTab === "catalog" ? (
              <div />
            ) : (
              <nav className="flex flex-wrap gap-2" aria-label="Разделы курсов">
                <LearnerTabLink
                  href={buildLearnerCoursesHref({ tab: "assigned", q, forceLearnerMode: shouldUseLearnerCoursesView })}
                  active={learnerTab === "assigned"}
                  label={`Назначенные (${assignedInProgressCount})`}
                />
                <LearnerTabLink
                  href={buildLearnerCoursesHref({ tab: "completed", q, forceLearnerMode: shouldUseLearnerCoursesView })}
                  active={learnerTab === "completed"}
                  label={`Завершенные (${completedCount})`}
                />
              </nav>
            )}

            {learnerTab === "catalog" ? (
              <p className="text-sm text-[var(--ink-muted)]">
                {catalogCourses.length ? `${catalogCourses.length} курсов в текущей выдаче` : "Каталог пока пуст"}
              </p>
            ) : (
              <LearnerCourseSearch value={q} tab={learnerTab} forceLearnerMode={shouldUseLearnerCoursesView} />
            )}
          </div>

          {isLearnerSearchActive && (
            <div className="mt-4 flex flex-col gap-1 rounded-lg bg-[var(--surface)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium text-[var(--ink)]">Найдено курсов: {searchedLearnerCourses.length}</p>
              <p className="text-[var(--ink-muted)]">Поиск учитывает название, описание, категорию и уровень курса.</p>
            </div>
          )}

          {learnerTab === "catalog" && (
            <form
              action="/courses"
              className={`mt-4 grid gap-3 lg:items-end ${
                feedbackEnabled
                  ? "lg:grid-cols-[minmax(0,1.2fr)_180px_180px_180px_180px_auto_auto]"
                  : "lg:grid-cols-[minmax(0,1.2fr)_220px_220px_220px_auto_auto]"
              }`}
            >
              <input type="hidden" name="tab" value="catalog" />

              <label>
                <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Поиск курса</span>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Название или описание"
                  className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                />
              </label>

              <label>
                <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Категория</span>
                <select
                  name="category"
                  defaultValue={hrCategory ?? ""}
                  className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                >
                  <option value="">Все категории</option>
                  {COURSE_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Уровень</span>
                <select
                  name="difficulty"
                  defaultValue={hrDifficulty ?? ""}
                  className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                >
                  <option value="">Любой уровень</option>
                  {COURSE_DIFFICULTY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Длительность</span>
                <select
                  name="duration"
                  defaultValue={learnerDuration}
                  className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                >
                  <option value="all">Любая</option>
                  <option value="short">До 1 часа</option>
                  <option value="medium">1-3 часа</option>
                  <option value="long">Более 3 часов</option>
                </select>
              </label>

              {feedbackEnabled ? (
                <label>
                  <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Рейтинг</span>
                  <select
                    name="rating"
                    defaultValue={learnerRating}
                    className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                  >
                    <option value="all">Любой</option>
                    <option value="4plus">От 4.0</option>
                    <option value="3plus">От 3.0</option>
                  </select>
                </label>
              ) : null}

              <button
                type="submit"
                className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
              >
                Применить
              </button>

              <Link
                href={buildLearnerCoursesHref({ tab: "catalog", forceLearnerMode: shouldUseLearnerCoursesView })}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--line)] px-4 text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              >
                Сбросить
              </Link>
            </form>
          )}
        </div>

        {learnerTab === "assigned" && (!isLearnerSearchActive || continueCourse) && (
          <div className="border-b border-[var(--line)] bg-[var(--surface)] py-4">
            <ContinueLearningPanel
              course={continueCourse}
              hasAssignedCourses={isLearnerSearchActive ? searchedLearnerCourses.length > 0 : assignedCount > 0}
              forceLearnerMode={shouldUseLearnerCoursesView}
            />
          </div>
        )}
      </section>

      <section>
        {learnerTab === "catalog" ? (
          catalogCourses.length === 0 ? (
            <LearnerEmptyState message="Нет курсов под текущие фильтры. Попробуйте сбросить часть ограничений." />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {catalogCourses.map((course) => (
                <li key={course.id}>
                  <Link
                    href={`/courses/${course.id}/about?from=catalog`}
                    className="group block h-full overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-sm transition hover:border-[var(--line)] hover:shadow"
                  >
                    <LearnerCourseCover
                      coverUrl={course.coverUrl}
                      title={course.title}
                      meta={course.categoryLabel}
                    />

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
                            <span className="rounded-full bg-[var(--surface)] px-2.5 py-1">{course.difficultyLabel}</span>
                            <span className="rounded-full bg-[var(--surface)] px-2.5 py-1">{course.durationLabel}</span>
                          </div>
                          <h2 className="mt-3 line-clamp-2 text-lg font-semibold leading-snug text-[var(--ink)]">
                            {course.title}
                          </h2>
                        </div>

                        {feedbackEnabled ? (
                          <LearnerRatingBadge rating={course.averageRating} reviewsCount={course.reviewsCount} />
                        ) : null}
                      </div>

                      <p className="mt-3 line-clamp-3 min-h-[60px] text-sm leading-5 text-[var(--ink-muted)]">
                        {course.description || "Краткое описание курса пока не заполнено."}
                      </p>

                      <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                        <div className="min-w-0">
                          <div className="text-xs text-[var(--ink-muted)]">Автор</div>
                          <div className="truncate text-sm font-medium text-[var(--ink)]">{course.authorName}</div>
                        </div>
                        <LearnerAccessBadge
                          assigned={course.isAssigned}
                          state={course.learnerState}
                          accessWindow={course.accessWindow}
                        />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : (
          visibleAssignedCourses.length === 0 ? (
            <LearnerEmptyState
              message={
                isLearnerSearchActive
                  ? continueCourse
                    ? `По запросу «${q}» найден курс в блоке «Продолжить обучение».`
                    : `По запросу «${q}» ничего не найдено.`
                  : learnerTab === "completed"
                    ? "Завершенных курсов пока нет."
                    : continueCourse
                      ? "Других назначенных курсов пока нет."
                      : "Назначенных курсов пока нет."
              }
            />
          ) : (
            <ul className="space-y-4">
              {visibleAssignedCourses.map((course) => (
                <LearnerAssignedCourseCard key={course.id} course={course} />
              ))}
            </ul>
          )
        )}
      </section>
    </div>
  );
}
