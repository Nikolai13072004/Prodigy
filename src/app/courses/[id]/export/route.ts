import { notFound } from "next/navigation";
import { requireCourseWorkspaceAccess } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";
import { buildXlsxWorkbook } from "@/lib/xlsx";

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { id: courseId } = await params;
  await requireCourseWorkspaceAccess(courseId);

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      modules: { orderBy: { orderIndex: "asc" } },
      items: {
        orderBy: { orderIndex: "asc" },
        include: {
          module: { select: { title: true } },
          quiz: {
            include: {
              questions: { where: { archivedAt: null }, orderBy: { orderIndex: "asc" } },
              attempts: {
                orderBy: { completedAt: "desc" },
                include: { user: { select: { name: true, login: true, email: true } } },
              },
            },
          },
        },
      },
      directAssignments: {
        include: { user: { select: { name: true, login: true, email: true } } },
      },
      groupAssignments: {
        include: { group: { select: { name: true } } },
      },
      feedbacks: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, login: true } } },
      },
    },
  });

  if (!course) notFound();

  const emailJobs = await prisma.emailJob.findMany({
    where: { payloadJson: { contains: courseId } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      toEmail: true,
      toName: true,
      subject: true,
      template: true,
      status: true,
      attempts: true,
      createdAt: true,
      sentAt: true,
      lastError: true,
    },
  });

  const rows = [
    ["Пакет курса", course.title],
    ["ID", course.id],
    ["Статус", course.status],
    ["Дата публикации", formatDate(course.publishedAt)],
    ["Создан", formatDate(course.createdAt)],
    [],
    ["Материалы"],
    ["Раздел", "Тип", "Название", "Обязательный", "Вопросов"],
    ...course.items.map((item) => [
      item.module?.title ?? "Без раздела",
      item.type,
      item.title,
      item.isRequired ? "Да" : "Нет",
      item.quiz?.questions.length ?? "",
    ]),
    [],
    ["Индивидуальные назначения"],
    ["Ученик", "Логин", "Email", "Назначен", "Доступ до"],
    ...course.directAssignments.map((assignment) => [
      assignment.user.name,
      assignment.user.login,
      assignment.user.email ?? "",
      formatDate(assignment.assignedAt),
      formatDate(assignment.expiresAt),
    ]),
    [],
    ["Групповые назначения"],
    ["Группа", "Назначена", "Доступ до"],
    ...course.groupAssignments.map((assignment) => [
      assignment.group.name,
      formatDate(assignment.assignedAt),
      formatDate(assignment.expiresAt),
    ]),
    [],
    ["Попытки тестов"],
    ["Тест", "Ученик", "Логин", "Попытка", "Статус", "Правильных", "Всего", "Дата"],
    ...course.items.flatMap((item) =>
      (item.quiz?.attempts ?? []).map((attempt) => [
        item.title,
        attempt.user.name,
        attempt.user.login,
        attempt.attemptNumber,
        attempt.outcome,
        attempt.correctAnswers,
        attempt.totalQuestions,
        formatDate(attempt.completedAt),
      ])
    ),
    [],
    ["Отзывы"],
    ["Ученик", "Логин", "Оценка", "Статус", "Комментарий", "Дата"],
    ...course.feedbacks.map((feedback) => [
      feedback.user.name,
      feedback.user.login,
      feedback.rating,
      feedback.status,
      feedback.comment ?? "",
      formatDate(feedback.createdAt),
    ]),
    [],
    ["Email"],
    ["Дата", "Получатель", "Email", "Тема", "Шаблон", "Статус", "Попыток", "Ошибка"],
    ...emailJobs.map((job) => [
      formatDate(job.sentAt ?? job.createdAt),
      job.toName ?? "",
      job.toEmail,
      job.subject,
      job.template ?? "",
      job.status,
      job.attempts,
      job.lastError ?? "",
    ]),
  ];

  const workbook = buildXlsxWorkbook({
    sheetName: "course-package",
    rows,
  });

  return new Response(workbook, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="course-${course.id}-package.xlsx"`,
    },
  });
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleString("ru-RU") : "";
}
