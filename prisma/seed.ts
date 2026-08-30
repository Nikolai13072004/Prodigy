import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { ROLE_PERMISSIONS, ROLES, STANDARD_ROLE_NAMES, primaryRole } from "../src/lib/roles";

const prisma = new PrismaClient();

type SeedUser = {
  login: string;
  password: string;
  email: string;
  name: string;
  roles: Array<
    | typeof STANDARD_ROLE_NAMES.SYSTEM_ADMIN
    | typeof STANDARD_ROLE_NAMES.STUDENT
    | typeof STANDARD_ROLE_NAMES.HR
  >;
  groupKey?: GroupKey;
};
function splitSeedUserName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? name,
    lastName: parts.slice(1).join(" ") || null,
  };
}


type GroupKey = "finance" | "accounting" | "calculation";
type QuestionType = "SINGLE_CHOICE" | "OPEN" | "MATCHING";

type SeedQuestion = {
  orderIndex: number;
  type: QuestionType;
  prompt: string;
  points: number;
  config: string;
};

type SeedCourse = {
  groupKey: GroupKey;
  title: string;
  description: string;
};

type CourseCreated = {
  id: string;
  title: string;
  groupKey: GroupKey;
  presentationItemId: string;
  videoItemId: string;
  quizId: string;
  questionCount: number;
};

const GROUPS: Record<GroupKey, string> = {
  finance: "Финансисты",
  accounting: "Бухгалтерия",
  calculation: "Расчетчики",
};

const COURSES: SeedCourse[] = [
  {
    groupKey: "finance",
    title: "Финансы: бюджетирование и контроль",
    description: "Основы бюджетного планирования, контроль отклонений и правила согласования.",
  },
  {
    groupKey: "finance",
    title: "Финансы: финансовая отчетность",
    description: "Состав отчетности, структура показателей и контроль корректности данных.",
  },
  {
    groupKey: "finance",
    title: "Финансы: платежный календарь",
    description: "Приоритизация платежей, кассовые разрывы и ежедневный мониторинг ликвидности.",
  },
  {
    groupKey: "finance",
    title: "Финансы: инвестиционная оценка",
    description: "Базовые подходы к оценке проектов, рисков и окупаемости.",
  },
  {
    groupKey: "accounting",
    title: "Бухгалтерия: первичные документы",
    description: "Проверка и учет первичных документов, типовые ошибки и контрольные точки.",
  },
  {
    groupKey: "accounting",
    title: "Бухгалтерия: НДС и регистры",
    description: "Правила работы с НДС, сверка регистров и подготовка к отчетному периоду.",
  },
  {
    groupKey: "accounting",
    title: "Бухгалтерия: закрытие периода",
    description: "Сценарии закрытия месяца, проверки и порядок фиксации результата.",
  },
  {
    groupKey: "accounting",
    title: "Бухгалтерия: учет затрат",
    description: "Методы распределения затрат и контроль корректности аналитики.",
  },
  {
    groupKey: "calculation",
    title: "Расчетчики: расчет зарплаты",
    description: "Типовые этапы расчета, источники ошибок и контроль итоговых начислений.",
  },
  {
    groupKey: "calculation",
    title: "Расчетчики: табели и графики",
    description: "Правила ввода табелей, проверка графиков и согласование корректировок.",
  },
  {
    groupKey: "calculation",
    title: "Расчетчики: удержания и выплаты",
    description: "Порядок удержаний, контроль выплат и работа с исключениями.",
  },
  {
    groupKey: "calculation",
    title: "Расчетчики: контроль расчетных ошибок",
    description: "Разбор типовых ошибок, повторная проверка и оформление корректировок.",
  },
];

const USERS: SeedUser[] = [
  {
    login: "admin",
    password: "admin",
    email: "admin@lms.local",
    name: "Администратор",
    roles: [STANDARD_ROLE_NAMES.SYSTEM_ADMIN],
  },
  {
    login: "hrmanager",
    password: "hrmanager",
    email: "hr@lms.local",
    name: "HR Менеджер",
    roles: [STANDARD_ROLE_NAMES.HR],
  },
  {
    login: "finansist",
    password: "finansist",
    email: "finansist1@lms.local",
    name: "Финансист1",
    roles: [STANDARD_ROLE_NAMES.STUDENT],
    groupKey: "finance",
  },
  {
    login: "finansist2",
    password: "finansist2",
    email: "finansist2@lms.local",
    name: "Финансист2",
    roles: [STANDARD_ROLE_NAMES.STUDENT],
    groupKey: "finance",
  },
  {
    login: "finansist3",
    password: "finansist3",
    email: "finansist3@lms.local",
    name: "Финансист3",
    roles: [STANDARD_ROLE_NAMES.STUDENT],
    groupKey: "finance",
  },
  {
    login: "buhgalter",
    password: "buhgalter",
    email: "buhgalter1@lms.local",
    name: "Бухгалтер1",
    roles: [STANDARD_ROLE_NAMES.STUDENT],
    groupKey: "accounting",
  },
  {
    login: "buhgalter2",
    password: "buhgalter2",
    email: "buhgalter2@lms.local",
    name: "Бухгалтер2",
    roles: [STANDARD_ROLE_NAMES.STUDENT],
    groupKey: "accounting",
  },
  {
    login: "buhgalter3",
    password: "buhgalter3",
    email: "buhgalter3@lms.local",
    name: "Бухгалтер3",
    roles: [STANDARD_ROLE_NAMES.STUDENT],
    groupKey: "accounting",
  },
  {
    login: "raschetchik",
    password: "raschetchik",
    email: "raschetchik1@lms.local",
    name: "Расчетчик1",
    roles: [STANDARD_ROLE_NAMES.STUDENT],
    groupKey: "calculation",
  },
  {
    login: "raschetchik2",
    password: "raschetchik2",
    email: "raschetchik2@lms.local",
    name: "Расчетчик2",
    roles: [STANDARD_ROLE_NAMES.STUDENT],
    groupKey: "calculation",
  },
  {
    login: "raschetchik3",
    password: "raschetchik3",
    email: "raschetchik3@lms.local",
    name: "Расчетчик3",
    roles: [STANDARD_ROLE_NAMES.STUDENT],
    groupKey: "calculation",
  },
];

const SYSTEM_ROLE_PROFILES = [
  { name: ROLES.ADMIN, permissions: ROLE_PERMISSIONS[ROLES.ADMIN] ?? [] },
  { name: STANDARD_ROLE_NAMES.SYSTEM_ADMIN, permissions: ROLE_PERMISSIONS[STANDARD_ROLE_NAMES.SYSTEM_ADMIN] ?? [] },
  { name: STANDARD_ROLE_NAMES.STUDENT, permissions: ROLE_PERMISSIONS[STANDARD_ROLE_NAMES.STUDENT] ?? [] },
  { name: STANDARD_ROLE_NAMES.HR, permissions: ROLE_PERMISSIONS[STANDARD_ROLE_NAMES.HR] ?? [] },
  { name: STANDARD_ROLE_NAMES.COURSE_AUTHOR, permissions: ROLE_PERMISSIONS[STANDARD_ROLE_NAMES.COURSE_AUTHOR] ?? [] },
];

function serializePermissions(permissions: string[]) {
  return JSON.stringify([...new Set(permissions)].sort());
}

function buildQuestions(courseTitle: string): SeedQuestion[] {
  const stem = courseTitle.split(":")[0];
  return [
    {
      orderIndex: 0,
      type: "SINGLE_CHOICE",
      prompt: `${stem}: кто отвечает за первичную проверку данных?`,
      points: 1,
      config: JSON.stringify({
        options: ["Руководитель подразделения", "Профильный специалист", "Внешний аудитор", "HR-менеджер"],
        correctIndex: 1,
      }),
    },
    {
      orderIndex: 1,
      type: "OPEN",
      prompt: "Введите ключевое слово для обязательной проверки перед отправкой.",
      points: 1,
      config: JSON.stringify({ sampleAnswer: "контроль" }),
    },
    {
      orderIndex: 2,
      type: "MATCHING",
      prompt: "Соотнесите этап процесса и результат.",
      points: 1,
      config: JSON.stringify({
        left: ["Проверка", "Согласование", "Фиксация"],
        right: ["Подтверждены входные данные", "Получено решение ответственного", "Результат отражен в системе"],
        correctPairs: [0, 1, 2],
      }),
    },
    {
      orderIndex: 3,
      type: "SINGLE_CHOICE",
      prompt: "Какой формат отчета является базовым для внутренней проверки?",
      points: 1,
      config: JSON.stringify({
        options: ["Текст без структуры", "Табличный отчет с метриками", "Скриншот переписки", "Устный комментарий"],
        correctIndex: 1,
      }),
    },
    {
      orderIndex: 4,
      type: "OPEN",
      prompt: "Введите слово, обозначающее обязательность соблюдения регламента.",
      points: 1,
      config: JSON.stringify({ sampleAnswer: "регламент" }),
    },
    {
      orderIndex: 5,
      type: "SINGLE_CHOICE",
      prompt: "Что делать при обнаружении расхождения в данных?",
      points: 1,
      config: JSON.stringify({
        options: ["Игнорировать до конца периода", "Оформить корректировку и повторную проверку", "Удалить строку", "Передать в архив"],
        correctIndex: 1,
      }),
    },
    {
      orderIndex: 6,
      type: "MATCHING",
      prompt: "Соотнесите тип ошибки и действие.",
      points: 1,
      config: JSON.stringify({
        left: ["Неполные данные", "Несоответствие сумм", "Неверная дата"],
        right: ["Запросить уточнение", "Сверить источники", "Исправить реквизиты"],
        correctPairs: [0, 1, 2],
      }),
    },
    {
      orderIndex: 7,
      type: "SINGLE_CHOICE",
      prompt: "Когда фиксируется итог проверки?",
      points: 1,
      config: JSON.stringify({
        options: ["После согласования", "До начала работы", "После публикации отчета", "В момент создания курса"],
        correctIndex: 0,
      }),
    },
    {
      orderIndex: 8,
      type: "OPEN",
      prompt: "Введите слово, обозначающее итоговый проверочный документ.",
      points: 1,
      config: JSON.stringify({ sampleAnswer: "отчет" }),
    },
    {
      orderIndex: 9,
      type: "MATCHING",
      prompt: "Соотнесите роль и ответственность.",
      points: 1,
      config: JSON.stringify({
        left: ["Исполнитель", "Проверяющий", "Руководитель"],
        right: ["Готовит данные", "Подтверждает корректность", "Принимает итоговое решение"],
        correctPairs: [0, 1, 2],
      }),
    },
  ];
}

function parseConfig(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildCorrectAnswer(question: SeedQuestion) {
  const config = parseConfig(question.config);
  if (question.type === "SINGLE_CHOICE") return String(Number(config.correctIndex ?? 0));
  if (question.type === "OPEN") return String(config.sampleAnswer ?? "");
  const pairs = Array.isArray(config.correctPairs) ? config.correctPairs : [];
  return pairs.map((value) => String(Number(value)));
}

function buildWrongAnswer(question: SeedQuestion) {
  const config = parseConfig(question.config);
  if (question.type === "SINGLE_CHOICE") {
    const options = Array.isArray(config.options) ? config.options.length : 2;
    const correct = Number(config.correctIndex ?? 0);
    if (options <= 1) return String(correct === 0 ? 1 : 0);
    return String((correct + 1) % options);
  }
  if (question.type === "OPEN") return "ошибка";
  const right = Array.isArray(config.right) ? config.right.length : 2;
  const left = Array.isArray(config.left) ? config.left.length : 0;
  return new Array(left).fill("").map((_, index) => String((index + 1) % Math.max(right, 2)));
}

function buildAnswersForCorrectCount(questions: SeedQuestion[], correctCount: number) {
  const answers: Record<string, string | string[]> = {};
  const threshold = Math.max(0, Math.min(correctCount, questions.length));
  for (const question of questions) {
    const key = `question_${question.orderIndex}`;
    if (question.orderIndex < threshold) {
      answers[key] = buildCorrectAnswer(question);
    } else {
      answers[key] = buildWrongAnswer(question);
    }
  }
  return answers;
}

function buildQuestionSnapshot(questions: { id: string; orderIndex: number; type: string; prompt: string; config: string; points: number }[]) {
  return questions.map((question) => ({
    id: question.id,
    orderIndex: question.orderIndex,
    type: question.type,
    prompt: question.prompt,
    config: question.config,
    points: question.points,
  }));
}

function toAttemptOutcomeLabel(outcome: "PASSED" | "ATTEMPTED" | "FAILED") {
  if (outcome === "PASSED") return "PASSED";
  if (outcome === "FAILED") return "FAILED";
  return "IN_PROGRESS";
}

function buildPresentationFileUrl(courseIndex: number) {
  const variant = (courseIndex % 3) + 1;
  return `https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf?course=${variant}`;
}

function buildVideoFileUrl(courseIndex: number) {
  const variant = (courseIndex % 2) + 1;
  return `https://www.w3schools.com/html/mov_bbb.mp4?course=${variant}`;
}

async function createUser(input: SeedUser) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const roleNames = [...new Set(input.roles)];
  const role = primaryRole(roleNames);
  if (!role) {
    throw new Error(`User ${input.login} must have at least one role`);
  }

  const nameParts = splitSeedUserName(input.name);

  const roleProfiles = await prisma.roleProfile.findMany({
    where: { name: { in: roleNames } },
    select: { id: true, name: true },
  });
  if (roleProfiles.length !== roleNames.length) {
    throw new Error(`Role profiles not found for user ${input.login}`);
  }

  return prisma.user.create({
    data: {
      login: input.login,
      email: input.email,
      name: input.name,
      role,
      passwordHash,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      userRoles: {
        create: roleProfiles.map((roleProfile) => ({
          roleProfileId: roleProfile.id,
        })),
      },
    },
  });
}

async function main() {
  await prisma.$transaction([
    prisma.courseFeedback.deleteMany(),
    prisma.quizUserBestResult.deleteMany(),
    prisma.quizAttempt.deleteMany(),
    prisma.question.deleteMany(),
    prisma.quiz.deleteMany(),
    prisma.courseItemView.deleteMany(),
    prisma.courseGroupAssignment.deleteMany(),
    prisma.courseUserAssignment.deleteMany(),
    prisma.groupMembership.deleteMany(),
    prisma.group.deleteMany(),
    prisma.courseItem.deleteMany(),
    prisma.course.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  await Promise.all(
    SYSTEM_ROLE_PROFILES.map((role) =>
      prisma.roleProfile.upsert({
        where: { name: role.name },
        create: {
          name: role.name,
          permissionsJson: serializePermissions(role.permissions),
          isSystem: true,
        },
        update: {
          permissionsJson: serializePermissions(role.permissions),
          isSystem: true,
        },
      })
    )
  );

  const users = await Promise.all(USERS.map((user) => createUser(user)));
  const usersByLogin = new Map(users.map((user) => [user.login, user]));
  const admin = usersByLogin.get("admin");
  if (!admin) throw new Error("Admin user was not created");

  const groups = await Promise.all(
    (Object.keys(GROUPS) as GroupKey[]).map((groupKey) =>
      prisma.group.create({
        data: { name: GROUPS[groupKey] },
      })
    )
  );
  const groupByKey = new Map<GroupKey, { id: string; name: string }>();
  for (const group of groups) {
    const key = (Object.keys(GROUPS) as GroupKey[]).find((candidate) => GROUPS[candidate] === group.name);
    if (key) groupByKey.set(key, group);
  }

  for (const userSeed of USERS.filter((user) => user.roles.includes(STANDARD_ROLE_NAMES.STUDENT) && user.groupKey)) {
    const user = usersByLogin.get(userSeed.login);
    const group = groupByKey.get(userSeed.groupKey!);
    if (!user || !group) continue;
    await prisma.groupMembership.create({
      data: {
        userId: user.id,
        groupId: group.id,
      },
    });
  }

  const courseCreated: CourseCreated[] = [];
  for (let courseIndex = 0; courseIndex < COURSES.length; courseIndex += 1) {
    const seedCourse = COURSES[courseIndex];
    const questions = buildQuestions(seedCourse.title);
    const course = await prisma.course.create({
      data: {
        title: seedCourse.title,
        description: seedCourse.description,
        ownerId: admin.id,
        status: "PUBLISHED",
        publishedAt: new Date(Date.now() - (COURSES.length - courseIndex) * 24 * 60 * 60 * 1000),
        resultViewMode:
          courseIndex % 3 === 0 ? "SCORE_ONLY" : courseIndex % 3 === 1 ? "SCORE_WITH_ANSWERS" : "FULL_REVIEW",
        items: {
          create: [
            {
              orderIndex: 1,
              type: "PDF",
              title: "Презентация",
              fileUrl: buildPresentationFileUrl(courseIndex),
              totalSlides: 10,
              isRequired: true,
            },
            {
              orderIndex: 2,
              type: "VIDEO",
              title: "Видеоматериалы",
              fileUrl: buildVideoFileUrl(courseIndex),
              isRequired: true,
            },
            {
              orderIndex: 3,
              type: "QUIZ",
              title: "Проверка знаний",
              isRequired: true,
              quiz: {
                create: {
                  description: `Итоговая проверка по теме «${seedCourse.title}».`,
                  maxAttempts: 2,
                  minCorrectAnswers: 8,
                  questions: {
                    create: questions,
                  },
                },
              },
            },
          ],
        },
      },
      include: {
        items: {
          include: {
            quiz: {
              include: {
                questions: { orderBy: { orderIndex: "asc" } },
              },
            },
          },
        },
      },
    });

    const presentationItem = course.items.find((item) => item.type === "PDF");
    const videoItem = course.items.find((item) => item.type === "VIDEO");
    const quizItem = course.items.find((item) => item.type === "QUIZ");
    if (!presentationItem || !videoItem || !quizItem?.quiz) {
      throw new Error(`Course ${course.title} is missing required items`);
    }

    courseCreated.push({
      id: course.id,
      title: course.title,
      groupKey: seedCourse.groupKey,
      presentationItemId: presentationItem.id,
      videoItemId: videoItem.id,
      quizId: quizItem.quiz.id,
      questionCount: quizItem.quiz.questions.length,
    });
  }

  for (const course of courseCreated) {
    const group = groupByKey.get(course.groupKey);
    if (!group) continue;
    await prisma.courseGroupAssignment.create({
      data: {
        courseId: course.id,
        groupId: group.id,
        assignedById: admin.id,
      },
    });
  }

  const financeUsers = USERS.filter((user) => user.groupKey === "finance").map((user) => usersByLogin.get(user.login)!);
  const accountingUsers = USERS.filter((user) => user.groupKey === "accounting").map((user) => usersByLogin.get(user.login)!);
  const calculationUsers = USERS.filter((user) => user.groupKey === "calculation").map((user) => usersByLogin.get(user.login)!);
  const usersByGroup: Record<GroupKey, { id: string; login: string; name: string }[]> = {
    finance: financeUsers,
    accounting: accountingUsers,
    calculation: calculationUsers,
  };

  for (let i = 0; i < courseCreated.length; i += 1) {
    const course = courseCreated[i];
    const groupUsers = usersByGroup[course.groupKey];
    const quiz = await prisma.quiz.findUnique({
      where: { id: course.quizId },
      include: { questions: { orderBy: { orderIndex: "asc" } } },
    });
    if (!quiz) continue;

    const questionSnapshot = JSON.stringify(buildQuestionSnapshot(quiz.questions));
    const maxScore = quiz.questions.reduce((sum, question) => sum + question.points, 0);

    for (let userIndex = 0; userIndex < groupUsers.length; userIndex += 1) {
      const user = groupUsers[userIndex];
      const baseDayOffset = i * 2 + userIndex;
      const now = Date.now();
      const createdAt = new Date(now - (35 - baseDayOffset) * 24 * 60 * 60 * 1000);

      if (userIndex === 0) {
        const correctAnswers = 8 + (i % 3);
        const answersMap = buildAnswersForCorrectCount(quiz.questions as unknown as SeedQuestion[], correctAnswers);
        const answerByQuestionId: Record<string, string | string[]> = {};
        for (const question of quiz.questions) {
          answerByQuestionId[question.id] = answersMap[`question_${question.orderIndex}`] ?? "";
        }
        const attempt = await prisma.quizAttempt.create({
          data: {
            quizId: quiz.id,
            userId: user.id,
            attemptNumber: 1,
            answers: JSON.stringify(answerByQuestionId),
            questionSnapshot,
            score: correctAnswers,
            maxScore,
            correctAnswers,
            totalQuestions: quiz.questions.length,
            outcome: "PASSED",
            createdAt,
            completedAt: new Date(createdAt.getTime() + 45 * 60 * 1000),
          },
        });

        await prisma.quizUserBestResult.create({
          data: {
            quizId: quiz.id,
            userId: user.id,
            bestAttemptId: attempt.id,
            bestScore: attempt.score,
            bestMaxScore: attempt.maxScore,
            bestCorrectAnswers: attempt.correctAnswers,
            attemptsUsed: 1,
            status: "PASSED",
          },
        });

        await prisma.courseItemView.create({
          data: {
            courseItemId: course.presentationItemId,
            userId: user.id,
            progressPercent: 100,
            maxPageSeen: 10,
            totalPages: 10,
            viewedAt: new Date(createdAt.getTime() - 30 * 60 * 1000),
          },
        });
        await prisma.courseItemView.create({
          data: {
            courseItemId: course.videoItemId,
            userId: user.id,
            progressPercent: 100,
            maxPageSeen: 1,
            totalPages: 1,
            viewedAt: new Date(createdAt.getTime() - 25 * 60 * 1000),
          },
        });
      }

      if (userIndex === 1) {
        const correctAnswers = 6 + (i % 2);
        const answersMap = buildAnswersForCorrectCount(quiz.questions as unknown as SeedQuestion[], correctAnswers);
        const answerByQuestionId: Record<string, string | string[]> = {};
        for (const question of quiz.questions) {
          answerByQuestionId[question.id] = answersMap[`question_${question.orderIndex}`] ?? "";
        }

        const attempt = await prisma.quizAttempt.create({
          data: {
            quizId: quiz.id,
            userId: user.id,
            attemptNumber: 1,
            answers: JSON.stringify(answerByQuestionId),
            questionSnapshot,
            score: correctAnswers,
            maxScore,
            correctAnswers,
            totalQuestions: quiz.questions.length,
            outcome: "ATTEMPTED",
            createdAt,
            completedAt: new Date(createdAt.getTime() + 30 * 60 * 1000),
          },
        });

        await prisma.quizUserBestResult.create({
          data: {
            quizId: quiz.id,
            userId: user.id,
            bestAttemptId: attempt.id,
            bestScore: attempt.score,
            bestMaxScore: attempt.maxScore,
            bestCorrectAnswers: attempt.correctAnswers,
            attemptsUsed: 1,
            status: toAttemptOutcomeLabel("ATTEMPTED"),
          },
        });

        await prisma.courseItemView.create({
          data: {
            courseItemId: course.presentationItemId,
            userId: user.id,
            progressPercent: 40,
            maxPageSeen: 4,
            totalPages: 10,
            viewedAt: new Date(createdAt.getTime() - 20 * 60 * 1000),
          },
        });
        await prisma.courseItemView.create({
          data: {
            courseItemId: course.videoItemId,
            userId: user.id,
            progressPercent: 100,
            maxPageSeen: 1,
            totalPages: 1,
            viewedAt: new Date(createdAt.getTime() - 15 * 60 * 1000),
          },
        });
      }

      if (userIndex === 2) {
        const firstCorrect = 4 + (i % 2);
        const secondCorrect = 6 + (i % 2);
        const firstAnswersMap = buildAnswersForCorrectCount(quiz.questions as unknown as SeedQuestion[], firstCorrect);
        const secondAnswersMap = buildAnswersForCorrectCount(quiz.questions as unknown as SeedQuestion[], secondCorrect);

        const firstAnswers: Record<string, string | string[]> = {};
        const secondAnswers: Record<string, string | string[]> = {};
        for (const question of quiz.questions) {
          firstAnswers[question.id] = firstAnswersMap[`question_${question.orderIndex}`] ?? "";
          secondAnswers[question.id] = secondAnswersMap[`question_${question.orderIndex}`] ?? "";
        }

        const attempt1 = await prisma.quizAttempt.create({
          data: {
            quizId: quiz.id,
            userId: user.id,
            attemptNumber: 1,
            answers: JSON.stringify(firstAnswers),
            questionSnapshot,
            score: firstCorrect,
            maxScore,
            correctAnswers: firstCorrect,
            totalQuestions: quiz.questions.length,
            outcome: "FAILED",
            createdAt,
            completedAt: new Date(createdAt.getTime() + 20 * 60 * 1000),
          },
        });

        const attempt2CreatedAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
        const attempt2 = await prisma.quizAttempt.create({
          data: {
            quizId: quiz.id,
            userId: user.id,
            attemptNumber: 2,
            answers: JSON.stringify(secondAnswers),
            questionSnapshot,
            score: secondCorrect,
            maxScore,
            correctAnswers: secondCorrect,
            totalQuestions: quiz.questions.length,
            outcome: "FAILED",
            createdAt: attempt2CreatedAt,
            completedAt: new Date(attempt2CreatedAt.getTime() + 25 * 60 * 1000),
          },
        });

        const bestAttempt = attempt2.score >= attempt1.score ? attempt2 : attempt1;
        await prisma.quizUserBestResult.create({
          data: {
            quizId: quiz.id,
            userId: user.id,
            bestAttemptId: bestAttempt.id,
            bestScore: bestAttempt.score,
            bestMaxScore: bestAttempt.maxScore,
            bestCorrectAnswers: bestAttempt.correctAnswers,
            attemptsUsed: 2,
            status: "FAILED",
          },
        });

        await prisma.courseItemView.create({
          data: {
            courseItemId: course.presentationItemId,
            userId: user.id,
            progressPercent: 100,
            maxPageSeen: 10,
            totalPages: 10,
            viewedAt: new Date(createdAt.getTime() - 10 * 60 * 1000),
          },
        });
      }
    }
  }

  for (let index = 0; index < courseCreated.length; index += 1) {
    const course = courseCreated[index];
    const groupUsers = usersByGroup[course.groupKey];
    const first = groupUsers[0];
    const second = groupUsers[1];

    await prisma.courseFeedback.create({
      data: {
        courseId: course.id,
        userId: first.id,
        rating: 4 + (index % 2),
        comment:
          index % 2 === 0
            ? "Материал структурирован хорошо, тест помогает закрепить знания."
            : "Курс полезный, но хотел бы больше практических примеров.",
        createdAt: new Date(Date.now() - (18 - index) * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.courseFeedback.create({
      data: {
        courseId: course.id,
        userId: second.id,
        rating: 2 + (index % 3),
        comment:
          index % 3 === 0
            ? "Есть непонятные формулировки в части вопросов."
            : "В целом нормально, но часть тем раскрыта слишком коротко.",
        createdAt: new Date(Date.now() - (16 - index) * 24 * 60 * 60 * 1000),
      },
    });
  }

  const duplicateAssignments = [
    { courseTitle: "Финансы: бюджетирование и контроль", login: "finansist" },
    { courseTitle: "Бухгалтерия: первичные документы", login: "buhgalter" },
    { courseTitle: "Расчетчики: расчет зарплаты", login: "raschetchik" },
  ];
  for (const item of duplicateAssignments) {
    const course = courseCreated.find((entry) => entry.title === item.courseTitle);
    const user = usersByLogin.get(item.login);
    if (!course || !user) continue;
    await prisma.courseUserAssignment.create({
      data: {
        courseId: course.id,
        userId: user.id,
        assignedById: admin.id,
      },
    });
  }

  console.log("Seed завершен.");
  console.log("Создано групп: 3");
  console.log("Создано пользователей (включая admin): 10");
  console.log("Создано курсов: 12");
  console.log("Создано тестов: 12, вопросов: 120");
  console.log("Логины:");
  for (const user of USERS) {
    console.log(`${user.login} / ${user.password}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
