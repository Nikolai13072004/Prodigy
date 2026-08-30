import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { CoursePortalFrame } from "@/components/CoursePortalFrame";
import { canViewCourseContent } from "@/lib/access";
import { isCourseAssignmentActive, resolveEffectiveCourseAccessWindow } from "@/lib/course-access-window";
import {
  buildCourseModuleGroups,
  isPublishedSnapshotActive,
  parsePublishedCourseSnapshot,
} from "@/lib/course-content";
import { getCourseDeadlineMeta } from "@/lib/course-deadline";
import {
  appendCourseReturnSource,
  getCourseBackLink,
  getCourseReturnSource,
} from "@/lib/course-return-source";
import {
  formatCourseDuration,
  getCourseCategoryLabel,
  getCourseDifficultyLabel,
} from "@/lib/course-metadata";
import { getPlatformSettings } from "@/lib/platform-settings";
import prisma from "@/lib/prisma";
import { canTrackMaterialProgress } from "@/lib/roles";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export default async function CourseAboutPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const course = await prisma.course.findFirst({
    where: {
      id,
      status: "PUBLISHED",
    },
    include: {
      owner: {
        select: {
          name: true,
          login: true,
        },
      },
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
        select: {
          id: true,
          moduleId: true,
          orderIndex: true,
          type: true,
          title: true,
          isRequired: true,
        },
      },
      feedbacks: {
        where: { status: "PUBLISHED" },
        select: {
          rating: true,
        },
      },
      surveyTemplate: {
        select: {
          isActive: true,
        },
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

  if (!course) {
    notFound();
  }

  const [canOpenContent, settings] = await Promise.all([
    canViewCourseContent(
      session.user.id,
      session.user.roles,
      course.id,
      session.user.permissions
    ),
    getPlatformSettings(),
  ]);
  const canStudyMaterials = canTrackMaterialProgress(session.user.roles, session.user.permissions);

  const averageRating =
    settings.feedbackEnabled && course.feedbacks.length > 0
      ? Number(
          (
            course.feedbacks.reduce((sum, feedback) => sum + feedback.rating, 0) /
            course.feedbacks.length
          ).toFixed(1)
        )
      : null;
  const publishedSnapshot = isPublishedSnapshotActive(course)
    ? parsePublishedCourseSnapshot(course.publishedSnapshotJson)
    : null;
  const inheritedAssignments = course.groupAssignments.filter(
    (assignment) => assignment.group.memberships.length > 0
  );
  const hasActiveDirectAssignment = course.directAssignments.some((assignment) =>
    isCourseAssignmentActive(assignment.expiresAt)
  );
  const hasActiveInheritedAssignment = inheritedAssignments.some((assignment) =>
    isCourseAssignmentActive(assignment.expiresAt)
  );
  const hasAssignment =
    course.directAssignments.length > 0
      ? hasActiveDirectAssignment || !hasActiveInheritedAssignment
      : inheritedAssignments.length > 0;
  const displayCourse = {
    title: publishedSnapshot?.title ?? course.title,
    description: publishedSnapshot?.description ?? course.description,
    requirements: publishedSnapshot?.requirements ?? course.requirements,
    targetAudience: publishedSnapshot?.targetAudience ?? course.targetAudience,
    category: publishedSnapshot?.category ?? course.category,
    difficultyLevel: publishedSnapshot?.difficultyLevel ?? course.difficultyLevel,
    durationMinutes: publishedSnapshot?.durationMinutes ?? course.durationMinutes,
    coverUrl: publishedSnapshot?.coverUrl ?? course.coverUrl,
  };
  const displayModules = publishedSnapshot?.modules ?? course.modules;
  const displayItems = publishedSnapshot?.items ?? course.items;
  const programGroups = buildCourseModuleGroups({
    modules: displayModules,
    items: displayItems,
    includeEmptyModules: false,
  });
  const requiredItemsCount = displayItems.filter((item) => item.isRequired).length;
  const learnerAccessWindow = hasAssignment
    ? resolveEffectiveCourseAccessWindow(
      course.directAssignments.map((assignment) => assignment.expiresAt),
      inheritedAssignments.map((assignment) => assignment.expiresAt)
      )
    : null;
  const deadlineMeta = learnerAccessWindow ? getCourseDeadlineMeta(learnerAccessWindow, false) : null;
  const returnSource = getCourseReturnSource(sp.from);
  const backLink = getCourseBackLink(returnSource);

  return (
    <main className="mx-auto max-w-6xl">
      <CoursePortalFrame
        courseId={course.id}
        active="about"
        showFeedback={settings.feedbackEnabled}
        feedbackCount={settings.feedbackEnabled ? course.feedbacks.length : 0}
        showSurvey={Boolean(canStudyMaterials && canOpenContent && course.surveyTemplate?.isActive)}
        title={displayCourse.title}
        description={displayCourse.description || "Описание курса пока не заполнено."}
        coverUrl={displayCourse.coverUrl}
        backHref={backLink.href}
        backLabel={backLink.label}
        contentDisabled={!canOpenContent}
        returnSource={returnSource}
        actions={
          canOpenContent ? (
            <Link
              href={appendCourseReturnSource(`/courses/${course.id}`, returnSource)}
              className="rounded-md bg-white px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-white/90"
            >
              Перейти к обучению
            </Link>
          ) : hasAssignment && deadlineMeta?.isExpired ? (
            <span className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/15 px-3 py-2 text-sm text-white">
              Срок доступа истек
            </span>
          ) : hasAssignment && !canStudyMaterials ? (
            <span className="rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/15 px-3 py-2 text-sm text-white">
              Материалы недоступны по роли
            </span>
          ) : (
            <span className="rounded-md border border-white/25 px-3 py-2 text-sm text-white/80">
              Доступ откроется после назначения
            </span>
          )
        }
      >
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            {hasAssignment && !canOpenContent && deadlineMeta?.isExpired ? (
              <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)] shadow-sm">
                Срок доступа к курсу истек. Материалы и тесты недоступны, но карточка курса сохранена для просмотра.
              </div>
            ) : null}

            {hasAssignment && !canOpenContent && !deadlineMeta?.isExpired && !canStudyMaterials ? (
              <div className="rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning)] shadow-sm">
                Курс назначен, но право на просмотр материалов и ведение прогресса не выдано для этой роли.
              </div>
            ) : null}

            <div className="rounded-xl border border-[var(--line)] bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-[var(--ink)]">О курсе</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[var(--ink)]">
                {displayCourse.description || "Описание курса пока не заполнено."}
              </p>
            </div>

            <section className="rounded-xl border border-[var(--line)] bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-[var(--ink)]">Программа курса</h2>
              {programGroups.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--ink)]">Материалы курса пока не добавлены.</p>
              ) : (
                <div className="mt-3 space-y-4">
                  {programGroups.map((group, groupIndex) => (
                    <section key={group.id ?? `program-group-${groupIndex}`}>
                      {!group.isSynthetic || programGroups.length > 1 ? (
                        <div className="mb-2">
                          <h3 className="text-sm font-semibold text-[var(--ink)]">{group.title}</h3>
                          {group.description ? (
                            <p className="mt-1 text-xs text-[var(--ink-muted)]">{group.description}</p>
                          ) : null}
                        </div>
                      ) : null}

                      <ol className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)]">
                        {group.items.map((item, itemIndex) => (
                          <li key={item.id} className="flex items-start gap-3 px-3 py-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-xs font-semibold text-[var(--ink-muted)]">
                              {itemIndex + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[var(--ink)]">{item.title}</p>
                              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                                {getCourseItemTypeLabel(item.type)}
                                {item.isRequired ? " · обязательный" : ""}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>
              )}
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-[var(--line)] bg-white p-4 shadow-sm">
                <h2 className="text-base font-semibold text-[var(--ink)]">Требования к ученику</h2>
                <p className="mt-2 text-sm text-[var(--ink)]">
                  {displayCourse.requirements || "Специальные требования пока не указаны."}
                </p>
              </section>

              <section className="rounded-xl border border-[var(--line)] bg-white p-4 shadow-sm">
                <h2 className="text-base font-semibold text-[var(--ink)]">Целевая аудитория</h2>
                <p className="mt-2 text-sm text-[var(--ink)]">
                  {displayCourse.targetAudience || "Целевая аудитория пока не указана."}
                </p>
              </section>
            </div>
          </div>

          <aside className="rounded-xl border border-[var(--line)] bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-[var(--ink)]">Карточка курса</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-[var(--ink-muted)]">Автор</dt>
                <dd className="mt-1 font-medium text-[var(--ink)]">
                  {course.owner?.name ?? course.owner?.login ?? "Не назначен"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ink-muted)]">Категория</dt>
                <dd className="mt-1 text-[var(--ink)]">{getCourseCategoryLabel(displayCourse.category)}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-muted)]">Уровень</dt>
                <dd className="mt-1 text-[var(--ink)]">{getCourseDifficultyLabel(displayCourse.difficultyLevel)}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-muted)]">Длительность</dt>
                <dd className="mt-1 text-[var(--ink)]">{formatCourseDuration(displayCourse.durationMinutes)}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-muted)]">Материалы</dt>
                <dd className="mt-1 text-[var(--ink)]">
                  {displayItems.length} всего, {requiredItemsCount} обязательных
                </dd>
              </div>
              {deadlineMeta ? (
                <div>
                  <dt className="text-[var(--ink-muted)]">Доступ</dt>
                  <dd className="mt-1 text-[var(--ink)]">{deadlineMeta.compactLabel}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[var(--ink-muted)]">Рейтинг</dt>
                <dd className="mt-1 text-[var(--ink)]">
                  {averageRating === null ? "Пока нет оценок" : `${averageRating}/5 на основе ${course.feedbacks.length} отзывов`}
                </dd>
              </div>
            </dl>

            {settings.feedbackEnabled ? (
              <Link
                href={appendCourseReturnSource(`/courses/${course.id}/feedback`, returnSource)}
                className="mt-4 inline-flex w-full justify-center rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              >
                Перейти к отзывам
              </Link>
            ) : null}
          </aside>
        </section>
      </CoursePortalFrame>
    </main>
  );
}

function getCourseItemTypeLabel(type: string) {
  if (type === "QUIZ") return "Тест";
  if (type === "SURVEY") return "Опрос";
  if (type === "PRESENTATION") return "Презентация";
  if (type === "VIDEO") return "Видео";
  return "Материал";
}
