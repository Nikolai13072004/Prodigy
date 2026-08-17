import Link from "next/link";
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
      <Link href="/admin/reports" className="text-sm text-emerald-700 underline">
        ← К отчетам
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Сравнение групп</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Сравните группы по назначению и прохождению выбранного курса.
          </p>
        </div>
      </div>

      <form className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium text-zinc-700">
          Курс
          <select
            name="courseId"
            defaultValue={selectedCourseId}
            className="mt-2 h-11 w-full max-w-xl rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-emerald-500 focus:ring-2"
          >
            {courses.map((courseOption) => (
              <option key={courseOption.id} value={courseOption.id}>
                {courseOption.title}
              </option>
            ))}
          </select>
        </label>
        <button className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          Применить
        </button>
      </form>

      <section className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Группа</th>
                <th className="px-4 py-3 text-left font-medium">Участников</th>
                <th className="px-4 py-3 text-left font-medium">Назначено</th>
                <th className="px-4 py-3 text-left font-medium">Завершили</th>
                <th className="px-4 py-3 text-left font-medium">В процессе</th>
                <th className="px-4 py-3 text-left font-medium">Не начали</th>
                <th className="px-4 py-3 text-left font-medium">Средний прогресс</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-200 text-zinc-700">
                  <td className="px-4 py-4 font-medium text-zinc-950">{row.name}</td>
                  <td className="px-4 py-4">{row.members}</td>
                  <td className="px-4 py-4">{row.assigned}</td>
                  <td className="px-4 py-4">{row.completed}</td>
                  <td className="px-4 py-4">{row.inProgress}</td>
                  <td className="px-4 py-4">{row.notStarted}</td>
                  <td className="px-4 py-4">{row.average}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
