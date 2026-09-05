import Link from "next/link";
import { Button, Field, Select, TD, TH, THead, TR, Table } from "@/components/ui";
import { requirePermission } from "@/lib/auth-guards";
import { getCourseProgress } from "@/lib/course-progress";
import prisma from "@/lib/prisma";
import { PERMISSIONS, ROLES } from "@/lib/roles";

type Props = {
  searchParams: Promise<{ courseId?: string }>;
};

export default async function GroupComparisonReportPage({ searchParams }: Props) {
  await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const sp = await searchParams;

  const courses = await prisma.course.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
  const selectedCourseId = sp.courseId || courses[0]?.id || "";
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    include: {
      memberships: {
        where: {
          user: {
            OR: [
              { role: ROLES.STUDENT },
              { userRoles: { some: { roleProfile: { name: ROLES.STUDENT } } } },
            ],
          },
        },
        select: { userId: true },
      },
    },
  });

  const learnerIds = [...new Set(groups.flatMap((group) => group.memberships.map((membership) => membership.userId)))];
  const [course, directAssignments, groupAssignments] = selectedCourseId
    ? await Promise.all([
        prisma.course.findUnique({
          where: { id: selectedCourseId },
          include: {
            items: {
              where: { archivedAt: null },
              orderBy: { orderIndex: "asc" },
              include: {
                views: { where: { userId: { in: learnerIds } }, select: { userId: true, progressPercent: true } },
                quiz: {
                  include: {
                    attempts: {
                      where: { userId: { in: learnerIds } },
                      orderBy: { attemptNumber: "asc" },
                    },
                  },
                },
              },
            },
          },
        }),
        prisma.courseUserAssignment.findMany({
          where: { courseId: selectedCourseId, userId: { in: learnerIds } },
          select: { userId: true },
        }),
        prisma.courseGroupAssignment.findMany({
          where: { courseId: selectedCourseId },
          select: { groupId: true },
        }),
      ])
    : [null, [], []] as const;

  const directlyAssigned = new Set(directAssignments.map((assignment) => assignment.userId));
  const assignedGroupIds = new Set(groupAssignments.map((assignment) => assignment.groupId));
  const rows = groups.map((group) => {
    const members = group.memberships.map((membership) => membership.userId);
    const assignedMembers = members.filter((userId) => assignedGroupIds.has(group.id) || directlyAssigned.has(userId));
    const progressRows = assignedMembers.map((userId) => {
      if (!course) return 0;
      const progress = getCourseProgress({
        courseTitle: course.title,
        quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
        items: course.items.map((item) => ({
          ...item,
          viewed: item.type === "QUIZ" ? false : item.views.some((view) => view.userId === userId),
          materialProgress:
            item.type === "QUIZ"
              ? 0
              : item.views.find((view) => view.userId === userId)?.progressPercent ?? 0,
          quiz: item.quiz
            ? {
                ...item.quiz,
                attempts: item.quiz.attempts.filter((attempt) => attempt.userId === userId),
              }
            : null,
        })),
      });
      return progress.percent;
    });
    const completed = progressRows.filter((percent) => percent >= 100).length;
    const inProgress = progressRows.filter((percent) => percent > 0 && percent < 100).length;
    const notStarted = Math.max(0, assignedMembers.length - completed - inProgress);
    const average = progressRows.length
      ? Math.round(progressRows.reduce((sum, percent) => sum + percent, 0) / progressRows.length)
      : 0;

    return {
      id: group.id,
      name: group.name,
      members: members.length,
      assigned: assignedMembers.length,
      completed,
      inProgress,
      notStarted,
      average,
    };
  });

  return (
    <main className="mx-auto max-w-6xl">
      <Link href="/admin/reports" className="text-sm text-[var(--accent)] underline">
        ← К отчетам
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Сравнение групп</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">
            Сравните группы по назначению и прохождению выбранного курса.
          </p>
        </div>
      </div>

      <form className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm">
        <Field label="Курс" htmlFor="courseId">
          <Select
            id="courseId"
            name="courseId"
            defaultValue={selectedCourseId}
            className="max-w-xl"
          >
            {courses.map((courseOption) => (
              <option key={courseOption.id} value={courseOption.id}>
                {courseOption.title}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" className="mt-4">
          Применить
        </Button>
      </form>

      <section className="mt-6">
        <Table className="min-w-full border-collapse">
          <THead>
            <TR>
              <TH>Группа</TH>
              <TH>Участников</TH>
              <TH>Назначено</TH>
              <TH>Завершили</TH>
              <TH>В процессе</TH>
              <TH>Не начали</TH>
              <TH>Средний прогресс</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((row) => (
              <TR key={row.id} className="text-[var(--ink-muted)]">
                <TD className="font-medium text-[var(--ink)]">{row.name}</TD>
                <TD>{row.members}</TD>
                <TD>{row.assigned}</TD>
                <TD>{row.completed}</TD>
                <TD>{row.inProgress}</TD>
                <TD>{row.notStarted}</TD>
                <TD>{row.average}%</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </section>
    </main>
  );
}
