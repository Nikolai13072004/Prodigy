import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findUnique({ where: { login: "admin" }, select: { id: true } });
  if (!admin) throw new Error("admin user not found");

  const financierGroup = await prisma.group.findUnique({
    where: { name: "Финансист" },
    select: { id: true, name: true },
  });
  if (!financierGroup) throw new Error("group 'Финансист' not found");

  const targetCourse = await prisma.course.findFirst({
    where: { title: "Ознакомление с политикой хранения данных" },
    select: {
      id: true,
      title: true,
      items: { select: { orderIndex: true }, orderBy: { orderIndex: "desc" }, take: 1 },
    },
  });
  if (!targetCourse) throw new Error("target course not found");

  const hasSimilarQuiz = await prisma.courseItem.findFirst({
    where: {
      courseId: targetCourse.id,
      type: "QUIZ",
      title: "Контрольный тест по политике хранения данных",
    },
    select: { id: true },
  });

  let quizItemId: string;
  let quizId: string;

  if (hasSimilarQuiz) {
    const existingQuiz = await prisma.quiz.findFirst({
      where: { courseItemId: hasSimilarQuiz.id },
      select: { id: true },
    });
    if (!existingQuiz) throw new Error("existing quiz item found without quiz");
    quizItemId = hasSimilarQuiz.id;
    quizId = existingQuiz.id;
  } else {
    const nextOrder = (targetCourse.items[0]?.orderIndex ?? -1) + 1;

    const created = await prisma.courseItem.create({
      data: {
        courseId: targetCourse.id,
        orderIndex: nextOrder,
        type: "QUIZ",
        title: "Контрольный тест по политике хранения данных",
        isRequired: true,
        quiz: {
          create: {
            description:
              "Проверьте понимание ключевых правил хранения, передачи и архивирования корпоративных данных.",
            maxAttempts: 3,
            minCorrectAnswers: 2,
            questions: {
              create: [
                {
                  orderIndex: 0,
                  type: "SINGLE_CHOICE",
                  prompt: "Где должны храниться рабочие документы с чувствительными данными?",
                  config: JSON.stringify({
                    options: [
                      "В личном облаке сотрудника",
                      "В утвержденной корпоративной системе",
                      "В личном мессенджере",
                    ],
                    correctIndex: 1,
                  }),
                  points: 1,
                },
                {
                  orderIndex: 1,
                  type: "OPEN",
                  prompt:
                    "Введите слово, которое означает обязательную проверку соблюдения правил перед архивированием.",
                  config: JSON.stringify({
                    sampleAnswer: "контроль",
                  }),
                  points: 1,
                },
                {
                  orderIndex: 2,
                  type: "MATCHING",
                  prompt: "Соотнесите действие и корректный результат.",
                  config: JSON.stringify({
                    left: ["Архивирование", "Передача данных"],
                    right: [
                      "Документы перемещены в утвержденное хранилище",
                      "Использован защищенный корпоративный канал",
                    ],
                    correctPairs: [0, 1],
                  }),
                  points: 2,
                },
              ],
            },
          },
        },
      },
      select: { id: true, quiz: { select: { id: true } } },
    });

    if (!created.quiz) throw new Error("created quiz item has no quiz");
    quizItemId = created.id;
    quizId = created.quiz.id;
  }

  const assignment = await prisma.courseGroupAssignment.upsert({
    where: {
      courseId_groupId: {
        courseId: targetCourse.id,
        groupId: financierGroup.id,
      },
    },
    create: {
      courseId: targetCourse.id,
      groupId: financierGroup.id,
      assignedById: admin.id,
    },
    update: {
      assignedById: admin.id,
    },
    select: { id: true, assignedAt: true },
  });

  const questionCount = await prisma.question.count({ where: { quizId } });

  console.log(
    JSON.stringify(
      {
        ok: true,
        course: { id: targetCourse.id, title: targetCourse.title },
        quizItemId,
        quizId,
        questionCount,
        group: financierGroup,
        assignment,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
