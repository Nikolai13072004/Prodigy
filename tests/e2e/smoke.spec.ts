import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test, type BrowserContext, type Locator, type Page } from "playwright/test";
import sharp from "sharp";
import { STANDARD_ROLE_NAMES } from "../../src/lib/roles";
import { generateTotpCode } from "../../src/lib/two-factor";

const ADMIN = { login: "admin", password: "admin" };
const HR = { login: "hrmanager", password: "hrmanager" };
const STUDENT = { login: "finansist2", password: "finansist2" };
const SEEDED_STUDENT_NAME = "Финансист2";
const SEEDED_STUDENT_EMAIL = "finansist2@lms.local";
const SEEDED_STUDENT_GROUP = "Финансисты";
const SEEDED_COURSE_TITLE = "Финансы: бюджетирование и контроль";
const e2eDbPath = `${process.cwd()}/prisma/e2e.db`;
const e2eDbUrl = `file:${e2eDbPath}`;

process.env.DATABASE_URL = e2eDbUrl;

let prisma: PrismaClient | null = null;
const execFileAsync = promisify(execFile);

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: e2eDbUrl,
        },
      },
    });
  }

  return prisma;
}

function formatDateRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatDateTimeRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function toDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function uploadedPublicPath(url: string) {
  const pathname = new URL(url, "http://localhost").pathname;
  expect(pathname).toMatch(/^\/uploads\/course-covers\/[a-z0-9-]+\.(png|jpg|gif)$/i);
  return path.join(process.cwd(), "public", pathname.replace(/^\/+/, ""));
}

async function seedLearnerCourseProgress(courseId: string, userId: string) {
  const courseItems = await getPrisma().courseItem.findMany({
    where: { courseId },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      type: true,
      totalSlides: true,
      quiz: {
        select: {
          id: true,
          questions: {
            select: {
              points: true,
            },
          },
        },
      },
    },
  });

  for (const materialItem of courseItems.filter((item) => item.type !== "QUIZ")) {
    const totalPages = materialItem.totalSlides ?? 1;
    await getPrisma().courseItemView.upsert({
      where: {
        courseItemId_userId: {
          courseItemId: materialItem.id,
          userId,
        },
      },
      create: {
        courseItemId: materialItem.id,
        userId,
        progressPercent: 100,
        maxPageSeen: totalPages,
        totalPages,
      },
      update: {
        progressPercent: 100,
        maxPageSeen: totalPages,
        totalPages,
        viewedAt: new Date(),
      },
    });
  }

  const quizzes = courseItems.flatMap((item) => (item.quiz ? [item.quiz] : []));
  for (const quiz of quizzes) {
    const maxScore = quiz.questions.reduce((sum, question) => sum + question.points, 0);
    const attempt = await getPrisma().quizAttempt.upsert({
      where: {
        quizId_userId_attemptNumber: {
          quizId: quiz.id,
          userId,
          attemptNumber: 1,
        },
      },
      create: {
        quizId: quiz.id,
        userId,
        attemptNumber: 1,
        answers: "{}",
        questionSnapshot: "{}",
        score: maxScore,
        maxScore,
        correctAnswers: quiz.questions.length,
        totalQuestions: quiz.questions.length,
        outcome: "PASSED",
      },
      update: {
        answers: "{}",
        questionSnapshot: "{}",
        score: maxScore,
        maxScore,
        correctAnswers: quiz.questions.length,
        totalQuestions: quiz.questions.length,
        outcome: "PASSED",
        completedAt: new Date(),
      },
      select: { id: true },
    });

    await getPrisma().quizUserBestResult.upsert({
      where: {
        quizId_userId: {
          quizId: quiz.id,
          userId,
        },
      },
      create: {
        quizId: quiz.id,
        userId,
        bestAttemptId: attempt.id,
        bestScore: maxScore,
        bestMaxScore: maxScore,
        bestCorrectAnswers: quiz.questions.length,
        attemptsUsed: 1,
        status: "PASSED",
      },
      update: {
        bestAttemptId: attempt.id,
        bestScore: maxScore,
        bestMaxScore: maxScore,
        bestCorrectAnswers: quiz.questions.length,
        attemptsUsed: 1,
        status: "PASSED",
      },
    });
  }

  await getPrisma().courseFeedback.upsert({
    where: {
      courseId_userId: {
        courseId,
        userId,
      },
    },
    create: {
      courseId,
      userId,
      rating: 5,
      comment: "Полезный курс",
    },
    update: {
      rating: 5,
      comment: "Полезный курс",
    },
  });
}

async function resetSeededStudentAccount() {
  const financeGroup = await getPrisma().group.findUnique({
    where: { name: SEEDED_STUDENT_GROUP },
    select: { id: true },
  });
  const student = await getPrisma().user.update({
    where: { login: STUDENT.login },
    data: {
      name: SEEDED_STUDENT_NAME,
      email: SEEDED_STUDENT_EMAIL,
      status: "ACTIVE",
      departmentId: null,
      failedLoginAttempts: 0,
      loginLockedUntil: null,
    },
    select: { id: true },
  });

  await getPrisma().groupMembership.deleteMany({
    where: { userId: student.id },
  });

  if (financeGroup) {
    await getPrisma().groupMembership.create({
      data: {
        groupId: financeGroup.id,
        userId: student.id,
      },
    });
  }
}

async function waitForCourseInvitePayload(email: string) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const job = await getPrisma().emailJob.findFirst({
      where: {
        toEmail: email,
        template: "COURSE_INVITE",
      },
      orderBy: { createdAt: "desc" },
      select: { payloadJson: true },
    });

    if (job?.payloadJson) {
      return JSON.parse(job.payloadJson) as {
        courseTitle: string;
        inviteUrl: string;
        accessExpiresAt: string | null;
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for COURSE_INVITE email for ${email}`);
}

async function waitForCourseAccessExtendedEmailPayload(email: string) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const job = await getPrisma().emailJob.findFirst({
      where: {
        toEmail: email,
        template: "COURSE_ACCESS_EXTENDED",
      },
      orderBy: { createdAt: "desc" },
      select: {
        subject: true,
        payloadJson: true,
      },
    });

    if (job?.payloadJson) {
      return {
        subject: job.subject,
        ...(JSON.parse(job.payloadJson) as {
          courseId: string;
          courseTitle: string;
          courseUrl: string;
          previousAccessLabel: string;
          nextAccessLabel: string;
        }),
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for COURSE_ACCESS_EXTENDED email for ${email}`);
}

async function waitForQuizReviewedEmailPayload(email: string) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const job = await getPrisma().emailJob.findFirst({
      where: {
        toEmail: email,
        template: "QUIZ_REVIEWED",
      },
      orderBy: { createdAt: "desc" },
      select: {
        subject: true,
        payloadJson: true,
      },
    });

    if (job?.payloadJson) {
      return {
        subject: job.subject,
        ...(JSON.parse(job.payloadJson) as {
          courseId: string;
          courseTitle: string;
          quizId: string;
          quizTitle: string;
          resultUrl: string;
          outcome: "PASSED" | "FAILED";
          reviewComment: string | null;
        }),
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for QUIZ_REVIEWED email for ${email}`);
}

async function waitForCourseAssignment(courseId: string, email: string) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const assignment = await getPrisma().courseUserAssignment.findFirst({
      where: {
        courseId,
        user: {
          is: { email },
        },
      },
      select: { expiresAt: true },
    });

    if (assignment) return assignment;

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for course assignment for ${email}`);
}

async function waitForHrNotificationEmailPayload(notificationType: string, learnerLogin: string) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const jobs = await getPrisma().emailJob.findMany({
      where: {
        template: "HR_NOTIFICATION",
      },
      orderBy: { createdAt: "desc" },
      select: { payloadJson: true },
      take: 50,
    });

    for (const job of jobs) {
      if (!job.payloadJson) continue;
      const payload = JSON.parse(job.payloadJson) as {
        type?: string;
        learnerLogin?: string;
        courseTitle?: string;
      };

      if (payload.type === notificationType && payload.learnerLogin === learnerLogin) {
        return payload;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for HR notification email ${notificationType} for ${learnerLogin}`);
}

async function waitForCourseBroadcastEmailJobs(subject: string, expectedCount: number) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const jobs = await getPrisma().emailJob.findMany({
      where: {
        template: "COURSE_BROADCAST",
        subject,
      },
      orderBy: { createdAt: "desc" },
      select: {
        toEmail: true,
        payloadJson: true,
      },
    });

    if (jobs.length >= expectedCount) {
      return jobs;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${expectedCount} COURSE_BROADCAST emails with subject "${subject}"`);
}

async function waitForScheduledReportEmailJobs(scheduleId: string, expectedCount: number) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const jobs = await getPrisma().emailJob.findMany({
      where: {
        template: "HR_REPORT_SCHEDULE",
      },
      orderBy: { createdAt: "desc" },
      select: {
        toEmail: true,
        subject: true,
        payloadJson: true,
      },
      take: 50,
    });

    const matching = jobs.filter((job) => {
      if (!job.payloadJson) return false;
      const payload = JSON.parse(job.payloadJson) as {
        scheduleId?: string;
      };
      return payload.scheduleId === scheduleId;
    });

    if (matching.length >= expectedCount) {
      return matching;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${expectedCount} HR_REPORT_SCHEDULE emails for schedule ${scheduleId}`);
}

async function waitForUserAccessEmailPayload(email: string, reason: "ACCOUNT_CREATED" | "PASSWORD_RESET") {
  const job = await waitForUserAccessEmailJob(email, reason);
  if (!job.payloadJson) {
    throw new Error(`USER_ACCESS email ${reason} for ${email} has no payload`);
  }

  return JSON.parse(job.payloadJson) as {
    login?: string;
    reason?: "ACCOUNT_CREATED" | "PASSWORD_RESET";
  };
}

async function waitForUserAccessEmailJob(email: string, reason: "ACCOUNT_CREATED" | "PASSWORD_RESET") {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const jobs = await getPrisma().emailJob.findMany({
      where: {
        toEmail: email,
        template: "USER_ACCESS",
      },
      orderBy: { createdAt: "desc" },
      select: {
        subject: true,
        htmlBody: true,
        textBody: true,
        payloadJson: true,
      },
      take: 20,
    });

    for (const job of jobs) {
      if (!job.payloadJson) continue;
      const payload = JSON.parse(job.payloadJson) as {
        login?: string;
        reason?: "ACCOUNT_CREATED" | "PASSWORD_RESET";
      };

      if (payload.reason === reason) {
        return job;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for USER_ACCESS email ${reason} for ${email}`);
}

async function waitForUserActivationEmailPayload(email: string) {
  const job = await waitForUserActivationEmailJob(email);
  if (!job.payloadJson) {
    throw new Error(`USER_ACTIVATION email for ${email} has no payload`);
  }

  return JSON.parse(job.payloadJson) as {
    login: string;
    activationUrl: string;
  };
}

async function waitForUserActivationEmailJob(email: string) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const job = await getPrisma().emailJob.findFirst({
      where: {
        toEmail: email,
        template: "USER_ACTIVATION",
      },
      orderBy: { createdAt: "desc" },
      select: {
        subject: true,
        htmlBody: true,
        textBody: true,
        payloadJson: true,
      },
    });

    if (job) {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for USER_ACTIVATION email for ${email}`);
}

async function waitForAuditLogEvent(where: { action?: string; objectId?: string; actorId?: string }) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const event = await getPrisma().auditLogEvent.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        objectId: true,
        objectLabel: true,
        actorId: true,
        actorName: true,
      },
    });

    if (event) return event;

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for audit event ${JSON.stringify(where)}`);
}

async function login(page: Page, credentials: { login: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(credentials.login);
  await page.getByLabel("Пароль").fill(credentials.password);

  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login")),
    page.getByRole("button", { name: "Войти" }).click(),
  ]);
}

async function gotoLoginPage(page: Page) {
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (!String(error).includes("ERR_ABORTED")) {
      throw error;
    }
  }
}

async function logoutToLogin(page: Page) {
  const logoutButton = page.getByRole("button", { name: "Выйти" });
  await expect(logoutButton).toBeVisible();
  await Promise.all([
    page
      .waitForURL((url) => url.pathname.startsWith("/login"), {
        timeout: 5_000,
        waitUntil: "domcontentloaded",
      })
      .catch(() => undefined),
    logoutButton.click(),
  ]);

  if (!new URL(page.url()).pathname.startsWith("/login")) {
    await page.context().clearCookies();
    await gotoLoginPage(page);
  }

  await expect(page.getByLabel("Логин")).toBeVisible();
}

async function setRichTextContent(locator: Locator, html: string) {
  await locator.evaluate((node, nextHtml) => {
    if (!(node instanceof HTMLElement)) return;
    node.innerHTML = nextHtml;
    const hiddenInput = node.parentElement?.parentElement?.parentElement?.querySelector(
      'input[type="hidden"][name="content"]'
    );
    if (hiddenInput instanceof HTMLInputElement) {
      hiddenInput.value = nextHtml;
    }
    node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: null }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
    node.dispatchEvent(new Event("blur", { bubbles: true }));
  }, html);
}

async function openAssignmentRecipientsDialog(page: Page) {
  await page.getByRole("button", { name: "Выбрать получателей" }).click();
  const dialog = page.getByRole("dialog", { name: "Выбрать получателей" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openAssignmentAccessPicker(dialog: Locator) {
  const picker = dialog.locator("details").last();
  await picker.locator("summary").click();
  return picker;
}

async function fillManagedEmailTemplate(
  page: Page,
  templateName: string,
  values: {
    subject: string;
    heading: string;
    body: string;
    footer: string;
  }
) {
  await page.getByRole("button", { name: new RegExp(templateName) }).click();
  const dialog = page.getByRole("dialog", { name: templateName });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Тема письма").fill(values.subject);
  await dialog.getByLabel("Заголовок письма").fill(values.heading);
  await dialog.getByLabel("Основной текст").fill(values.body);
  await dialog.getByLabel("Подпись / footer").fill(values.footer);
  await dialog.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("dialog", { name: templateName })).toHaveCount(0);
}

async function createUserWithRoles(args: {
  login: string;
  password: string;
  email: string;
  name: string;
  roles: string[];
  status?: string;
}) {
  const roleProfiles = await getPrisma().roleProfile.findMany({
    where: {
      name: {
        in: args.roles,
      },
    },
    select: { id: true, name: true },
  });

  expect(roleProfiles).toHaveLength(args.roles.length);

  const passwordHash = await bcrypt.hash(args.password, 10);
  return getPrisma().user.create({
    data: {
      login: args.login,
      email: args.email,
      name: args.name,
      passwordHash,
      role: args.roles[0] ?? STANDARD_ROLE_NAMES.STUDENT,
      status: args.status ?? "ACTIVE",
      userRoles: {
        create: roleProfiles.map((roleProfile) => ({
          roleProfileId: roleProfile.id,
        })),
      },
    },
    select: {
      id: true,
      login: true,
      email: true,
      name: true,
    },
  });
}

async function closeContexts(contexts: BrowserContext[]) {
  await Promise.all(contexts.map((context) => context.close()));
}

test.afterAll(async () => {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
});

test("admin can open reports and export learner report", async ({ page }) => {
  await login(page, ADMIN);

  await expect(page.getByText("История входов")).toBeVisible();
  await page.getByRole("link", { name: "Отчеты" }).click();

  await expect(page).toHaveURL(/\/admin\/reports/);
  await expect(page.getByRole("heading", { name: "Отчеты HR" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "HR-уведомления" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Прогресс учащихся" })).toBeVisible();

  await page.getByRole("button", { name: "Сохранить настройки" }).click();
  await expect(page.getByText("Настройки уведомлений сохранены.")).toBeVisible();

  await page.getByRole("link", { name: "Открыть «Прогресс учащихся»" }).click();
  await expect(page).toHaveURL(/\/admin\/reports\/learner-progress/);
  await expect(page.getByRole("heading", { name: "Прогресс учащихся" })).toBeVisible();

  await page.locator("summary").filter({ hasText: "Экспорт" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("learners-report.csv");
});

test("hr can create, pause, resume, queue, and delete a monthly report schedule", async ({ page }) => {
  const recipientA = `lead${Date.now().toString().slice(-6)}@example.com`;
  const recipientB = `backup${Date.now().toString().slice(-6)}@example.com`;
  const hrUser = await getPrisma().user.findUnique({
    where: { login: HR.login },
    select: { id: true },
  });
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: { id: true, title: true },
  });

  expect(hrUser?.id).toBeTruthy();
  expect(course?.id).toBeTruthy();

  await login(page, HR);
  await page.goto("/admin/reports#report-schedules");

  const createSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Расписания отчетов" }) })
    .first();
  await expect(createSection).toBeVisible();
  await createSection.locator('select[name="reportType"]').selectOption("COURSE_RESULTS");
  await createSection.locator('select[name="courseId"]').selectOption(course!.id);
  await createSection.locator('textarea[name="recipients"]').fill(`${recipientA}\n${recipientB}`);
  await createSection.getByRole("button", { name: "Сохранить расписание" }).click();

  await expect(page.getByText("Расписание отчета сохранено.")).toBeVisible();
  const listSection = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "Текущие расписания" }) })
    .first();
  const scheduleCard = listSection.locator("div").filter({ hasText: `Отчет по курсу: ${course!.title}` }).first();
  await expect(scheduleCard).toContainText(recipientA);
  await expect(scheduleCard).toContainText("Активно");

  await scheduleCard.getByRole("button", { name: "Приостановить" }).click();
  await expect(page.getByText("Расписание приостановлено.")).toBeVisible();
  await expect(scheduleCard).toContainText("Приостановлено");

  await scheduleCard.getByRole("button", { name: "Возобновить" }).click();
  await expect(page.getByText(/ежемесячному циклу/)).toBeVisible();
  await expect(scheduleCard).toContainText("Активно");

  const schedule = await getPrisma().hrReportSchedule.findFirst({
    where: {
      createdById: hrUser!.id,
      reportType: "COURSE_RESULTS",
      courseId: course!.id,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  expect(schedule?.id).toBeTruthy();

  await getPrisma().hrReportSchedule.update({
    where: { id: schedule!.id },
    data: {
      nextRunAt: new Date(Date.now() - 60_000),
    },
  });

  const workerResult = await execFileAsync("npx", ["tsx", "scripts/hr-report-schedule-worker.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: e2eDbUrl,
    },
  });
  expect(workerResult.stdout + workerResult.stderr).toContain("[hr-report-schedules] queued_schedules=");

  const jobs = await waitForScheduledReportEmailJobs(schedule!.id, 2);
  expect(jobs.map((job) => job.toEmail).sort()).toEqual([recipientA, recipientB].sort());
  expect(jobs[0]?.subject).toContain("Ежемесячный отчет LMS");

  await page.reload();
  const refreshedCard = page.locator("div").filter({ hasText: `Отчет по курсу: ${course!.title}` }).first();
  await expect(refreshedCard).toContainText("Последняя:");
  await refreshedCard.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText("Расписание удалено.")).toBeVisible();
  await expect(page.locator("div").filter({ hasText: `Отчет по курсу: ${course!.title}` })).toHaveCount(0);
});

test("hr can filter learners report and open learner progress across courses", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const department = await getPrisma().department.create({
    data: { name: `HR отдел ${uniqueSuffix}` },
    select: { id: true, name: true },
  });
  const group = await getPrisma().group.create({
    data: { name: `HR группа ${uniqueSuffix}` },
    select: { id: true, name: true },
  });
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: {
      id: true,
      title: true,
      items: {
        where: { type: { not: "QUIZ" } },
        orderBy: { orderIndex: "asc" },
        take: 1,
        select: { id: true },
      },
    },
  });

  expect(studentRoleProfile?.id).toBeTruthy();
  expect(course?.id).toBeTruthy();
  expect(course?.items[0]?.id).toBeTruthy();

  const oldLearner = await getPrisma().user.create({
    data: {
      name: `Старый ученик ${uniqueSuffix}`,
      login: `oldhr${uniqueSuffix}`,
      email: `oldhr${uniqueSuffix}@example.com`,
      passwordHash: "e2e-old-learner",
      role: "Ученик",
      status: "ACTIVE",
      createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      departmentId: department.id,
      userRoles: {
        create: {
          roleProfileId: studentRoleProfile!.id,
        },
      },
      groupMemberships: {
        create: {
          groupId: group.id,
        },
      },
    },
    select: { id: true, name: true },
  });

  const freshLearner = await getPrisma().user.create({
    data: {
      name: `Новый ученик ${uniqueSuffix}`,
      login: `freshhr${uniqueSuffix}`,
      email: `freshhr${uniqueSuffix}@example.com`,
      passwordHash: "e2e-fresh-learner",
      role: "Ученик",
      status: "ACTIVE",
      createdAt: new Date(),
      departmentId: department.id,
      userRoles: {
        create: {
          roleProfileId: studentRoleProfile!.id,
        },
      },
      groupMemberships: {
        create: {
          groupId: group.id,
        },
      },
    },
    select: { id: true, name: true },
  });

  await getPrisma().courseUserAssignment.createMany({
    data: [
      { courseId: course!.id, userId: oldLearner.id },
      { courseId: course!.id, userId: freshLearner.id },
    ],
  });

  await getPrisma().courseItemView.create({
    data: {
      courseItemId: course!.items[0]!.id,
      userId: freshLearner.id,
      progressPercent: 55,
      maxPageSeen: 5,
      totalPages: 10,
    },
  });

  await login(page, HR);
  await page.goto("/admin/reports");
  await page.getByRole("link", { name: "Открыть «Прогресс учащихся»" }).click();
  await expect(page).toHaveURL(/\/admin\/reports\/learner-progress/);

  await page.locator("summary").filter({ hasText: "Добавить фильтр" }).click();
  await page.getByLabel("Подразделение").selectOption(department.id);
  await page.getByLabel("Группа").selectOption(group.id);
  await page.getByLabel("С даты регистрации").fill(toDateInputValue(new Date()));
  await page.getByRole("button", { name: "Применить фильтры" }).click();

  await expect(page.getByRole("link", { name: freshLearner.name })).toBeVisible();
  await expect(page.getByRole("link", { name: oldLearner.name })).toHaveCount(0);

  await page.getByRole("link", { name: freshLearner.name }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/reports/${freshLearner.id}$`));
  await expect(page.getByRole("heading", { name: freshLearner.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Прогресс по всем курсам" })).toBeVisible();
  const courseRow = page.locator("table tbody tr").filter({ hasText: course!.title }).first();
  await expect(courseRow).toBeVisible();
  await expect(courseRow).toContainText("В обучении");
  await expect(courseRow.getByRole("link", { name: "Открыть курс" })).toBeVisible();
});

test("hr can review learner communication history and filter it by type and date", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: { id: true, title: true },
  });
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });

  expect(course?.id).toBeTruthy();
  expect(studentRoleProfile?.id).toBeTruthy();

  const learner = await getPrisma().user.create({
    data: {
      name: `Коммуникации Ученик ${uniqueSuffix}`,
      login: `commlearner${uniqueSuffix}`,
      email: `commlearner${uniqueSuffix}@example.com`,
      passwordHash: "comm-history",
      role: "Ученик",
      status: "ACTIVE",
      userRoles: {
        create: {
          roleProfileId: studentRoleProfile!.id,
        },
      },
    },
    select: { id: true, name: true, login: true, email: true },
  });

  const courseAssignedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const passwordResetQueuedAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

  await getPrisma().emailJob.createMany({
    data: [
      {
        toEmail: learner.email!,
        toName: learner.name,
        subject: "У тебя появился новый курс",
        htmlBody: "<p>course assigned</p>",
        textBody: "course assigned",
        template: "COURSE_ASSIGNED",
        payloadJson: JSON.stringify({
          courseTitle: course!.title,
          courseUrl: `http://127.0.0.1:3002/courses/${course!.id}`,
        }),
        status: "SENT",
        createdAt: courseAssignedAt,
        sentAt: courseAssignedAt,
      },
      {
        toEmail: learner.email!,
        toName: learner.name,
        subject: "Сброс пароля",
        htmlBody: "<p>password reset</p>",
        textBody: "password reset",
        template: "USER_ACCESS",
        payloadJson: JSON.stringify({
          loginUrl: "http://127.0.0.1:3002/login",
          login: learner.login,
          reason: "PASSWORD_RESET",
        }),
        status: "PENDING",
        createdAt: passwordResetQueuedAt,
      },
    ],
  });

  await login(page, HR);
  await page.goto(`/admin/reports/learner-progress?q=${encodeURIComponent(learner.login)}`);

  const learnerRow = page.locator("table tbody tr").filter({ hasText: learner.name }).first();
  await expect(learnerRow).toBeVisible();
  await learnerRow.getByRole("link", { name: learner.name }).click();

  await expect(page.getByRole("heading", { name: learner.name })).toBeVisible();
  await page.getByRole("link", { name: "Уведомления" }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/reports/${learner.id}\\?tab=notifications`));
  await expect(page.getByRole("heading", { name: "История коммуникаций" })).toBeVisible();

  const communicationRows = page.locator("table tbody tr");
  await expect(communicationRows).toHaveCount(2);
  await expect(communicationRows.filter({ hasText: "Назначение на курс" })).toHaveCount(1);
  await expect(communicationRows.filter({ hasText: "Сброс пароля" })).toHaveCount(1);
  await expect(
    communicationRows.filter({ hasText: `Ученику отправлено письмо о назначении курса «${course!.title}».` })
  ).toHaveCount(1);
  await expect(
    communicationRows.filter({ hasText: "Ученику отправлено письмо со сбросом пароля и временными данными для входа." })
  ).toHaveCount(1);

  await page.locator('select[name="communicationType"]').selectOption("course_assigned");
  await page.getByRole("button", { name: "Применить" }).click();

  await expect(page).toHaveURL(/communicationType=course_assigned/);
  await expect(communicationRows).toHaveCount(1);
  await expect(communicationRows.filter({ hasText: "Назначение на курс" })).toHaveCount(1);

  await page.locator('select[name="communicationType"]').selectOption("all");
  await page
    .locator('input[name="communicationFrom"]')
    .fill(toDateInputValue(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)));
  await page.getByRole("button", { name: "Применить" }).click();

  await expect(page).toHaveURL(/communicationFrom=/);
  await expect(communicationRows).toHaveCount(1);
  await expect(communicationRows.filter({ hasText: "Сброс пароля" })).toHaveCount(1);
});

test("admin can see system and custom roles separately", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const customRoleName = `Методист ${uniqueSuffix}`;

  await login(page, ADMIN);
  await page.goto("/admin/roles");

  await expect(page.getByRole("heading", { name: "Системные роли" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Кастомные роли" })).toBeVisible();

  const systemRolesSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Системные роли" }),
  });
  await expect(systemRolesSection).toContainText("Администратор системы");
  await expect(systemRolesSection).toContainText("Системная");

  const systemAdminRow = systemRolesSection.locator("tr").filter({
    has: page.getByText("Администратор системы", { exact: true }),
  });
  await expect(systemAdminRow.getByRole("button", { name: "Удалить" })).toHaveCount(0);

  await page.getByRole("link", { name: "Новая роль" }).click();
  await expect(page.getByRole("heading", { name: "Новая роль" })).toBeVisible();
  await page.getByLabel("Название роли").fill(customRoleName);
  await page.getByLabel("Просмотр пользователей").check();
  await page.getByRole("button", { name: "Создать роль" }).click();

  await expect(page).toHaveURL(/\/admin\/roles\/[^/]+$/);
  await page.goto("/admin/roles");

  const customRolesSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Кастомные роли" }),
  });
  await expect(customRolesSection).toContainText(customRoleName);
  await expect(customRolesSection).toContainText("Пользовательская");
});

test("admin can open the API tokens registry", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const secondCreatedAt = new Date(Date.now() - 26 * 60 * 60 * 1000);
  const lastUsedAt = new Date(Date.now() - 35 * 60 * 1000);
  const firstTokenName = `1C sync ${suffix}`;
  const secondTokenName = `HR export ${suffix}`;

  await getPrisma().apiToken.createMany({
    data: [
      {
        name: firstTokenName,
        tokenHash: `apitoken-${suffix}-1`,
        scope: "courses:read",
        createdAt,
        lastUsedAt,
      },
      {
        name: secondTokenName,
        tokenHash: `apitoken-${suffix}-2`,
        scope: "reports:read",
        createdAt: secondCreatedAt,
        lastUsedAt: null,
      },
    ],
  });

  await login(page, ADMIN);

  await expect(page.getByRole("link", { name: "API" })).toBeVisible();
  await page.getByRole("link", { name: "API" }).click();

  await expect(page).toHaveURL(/\/admin\/api$/);
  await expect(page.getByRole("heading", { name: "API-токены" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Список токенов интеграций" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Название" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Scope" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Дата создания" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Последнее использование" })).toBeVisible();
  await expect(page.getByText("Активных записей: 2")).toBeVisible();

  const firstRow = page.locator("table tbody tr").filter({ hasText: firstTokenName }).first();
  await expect(firstRow).toContainText("courses:read");
  await expect(firstRow).toContainText(formatDateTimeRu(createdAt));
  await expect(firstRow).toContainText(formatDateTimeRu(lastUsedAt));

  const secondRow = page.locator("table tbody tr").filter({ hasText: secondTokenName }).first();
  await expect(secondRow).toContainText("reports:read");
  await expect(secondRow).toContainText(formatDateTimeRu(secondCreatedAt));
  await expect(secondRow).toContainText("Не использовался");
});

test("admin can move from learners page to results page and export results", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto(`/courses?q=${encodeURIComponent(SEEDED_COURSE_TITLE)}`);

  const courseRow = page.locator("table tbody tr").filter({ hasText: SEEDED_COURSE_TITLE }).first();
  await expect(courseRow).toBeVisible();
  await courseRow.getByRole("link", { name: "Ученики" }).click();

  await expect(page.getByRole("heading", { name: SEEDED_COURSE_TITLE })).toBeVisible();
  await expect(page.getByText("Записано учеников")).toBeVisible();

  const resultsLink = page.getByRole("link", { name: "Результаты" });
  await expect(resultsLink).toHaveAttribute("href", /\/courses\/[^/]+\/results$/);
  await resultsLink.click();

  await expect(page).toHaveURL(/\/courses\/[^/]+\/results/);
  await expect(page.getByText("Ученики в отчете")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Экспорт CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toContain("-results.csv");
});

test("admin can return from access management to course content and the courses list", async ({ page }) => {
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: { id: true },
  });

  expect(course?.id).toBeTruthy();

  await login(page, ADMIN);
  await page.goto(`/courses/${course!.id}/manage?section=access`);

  await expect(page.getByRole("link", { name: "← К списку курсов" })).toBeVisible();
  await expect(page.getByRole("link", { name: "К просмотру курса" })).toHaveAttribute(
    "href",
    `/courses/${course!.id}?view=content`
  );

  await page.getByRole("link", { name: "К просмотру курса" }).click();

  await expect(page).toHaveURL(`/courses/${course!.id}?view=content`);
  await expect(page.getByRole("heading", { name: SEEDED_COURSE_TITLE })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Назад к курсам" })).toHaveAttribute("href", "/courses");
  await expect(page.getByRole("link", { name: "Управление курсом" })).toHaveAttribute(
    "href",
    `/courses/${course!.id}/manage`
  );

  await page.getByRole("link", { name: "← Назад к курсам" }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.getByRole("heading", { name: "Курсы", exact: true })).toBeVisible();
});

test("admin can update course basics and progression settings", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const initialTitle = `Авторский курс ${uniqueSuffix}`;
  const updatedTitle = `Авторский курс обновлен ${uniqueSuffix}`;
  const sectionTitle = `Раздел ${uniqueSuffix}`;
  const textMaterialTitle = `Страница ${uniqueSuffix}`;
  const quizMaterialTitle = `Тест ${uniqueSuffix}`;
  const adminUser = await getPrisma().user.findUnique({
    where: { login: ADMIN.login },
    select: { id: true },
  });

  expect(adminUser?.id).toBeTruthy();

  const course = await getPrisma().course.create({
    data: {
      title: initialTitle,
      description: "Карточка для проверки вкладок автора.",
      status: "DRAFT",
      ownerId: adminUser!.id,
    },
    select: { id: true },
  });
  const singleMaterialCourse = await getPrisma().course.create({
    data: {
      title: `Курс с одной презентацией ${uniqueSuffix}`,
      description: "Проверка автосоздания раздела.",
      status: "DRAFT",
      ownerId: adminUser!.id,
    },
    select: { id: true },
  });
  const courseModule = await getPrisma().courseModule.create({
    data: {
      courseId: course.id,
      title: sectionTitle,
      description: "Первый раздел курса.",
      orderIndex: 0,
    },
    select: { id: true },
  });
  await getPrisma().courseItem.createMany({
    data: [
      {
        courseId: course.id,
        moduleId: courseModule.id,
        title: textMaterialTitle,
        type: "TEXT",
        content: "<p>Материал для прохождения.</p>",
        orderIndex: 0,
        isRequired: true,
      },
    ],
  });
  await getPrisma().courseItem.create({
    data: {
      courseId: course.id,
      moduleId: courseModule.id,
      title: quizMaterialTitle,
      type: "QUIZ",
      orderIndex: 1,
      isRequired: true,
      quiz: {
        create: {
          maxAttempts: 2,
          minCorrectAnswers: 1,
        },
      },
    },
  });

  await login(page, ADMIN);
  await page.goto(`/courses/${course.id}/manage?section=basics`);

  await expect(page.getByRole("heading", { name: initialTitle })).toBeVisible();
  await expect(page.getByLabel("Ссылка на просмотр курса")).toHaveValue(new RegExp(`/courses/${course.id}$`));
  await page.locator('form#course-basics-form input[name="title"]').fill(updatedTitle);
  await page.locator('form#course-basics-form textarea[name="description"]').fill("Обновленное описание курса.");
  await page.locator('form#course-basics-form input[name="tags"]').fill("адаптация, продажи");
  await page.locator('form#course-basics-form input[name="durationHours"]').fill("1");
  await page.locator('form#course-basics-form input[name="durationMinutes"]').fill("30");
  await page.locator('form#course-basics-form button[type="submit"]').click();

  await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible();

  const updatedCourse = await getPrisma().course.findUnique({
    where: { id: course.id },
    select: {
      title: true,
      description: true,
      tagsJson: true,
      durationMinutes: true,
    },
  });
  expect(updatedCourse?.title).toBe(updatedTitle);
  expect(updatedCourse?.description).toBe("Обновленное описание курса.");
  expect(updatedCourse?.tagsJson).toBe(JSON.stringify(["адаптация", "продажи"]));
  expect(updatedCourse?.durationMinutes).toBe(90);

  await page.goto(`/courses/${course.id}/manage?section=structure`);
  await page.getByRole("button", { name: "Настройки прохождения" }).click();
  await page.getByLabel("Порядок просмотра материалов").selectOption("SEQUENTIAL");
  await page.getByLabel("Условие завершения курса").selectOption("REQUIRED_ITEMS");
  await page.getByLabel("Формат статуса курса").selectOption("PASSED_WITH_SCORE");
  await page
    .locator("li")
    .filter({ hasText: quizMaterialTitle })
    .getByRole("checkbox")
    .last()
    .check();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();

  await expect(page.getByText("Настройки прохождения сохранены")).toBeVisible();

  const progressionSettings = await getPrisma().course.findUnique({
    where: { id: course.id },
    select: {
      navigationMode: true,
      completionMode: true,
      statusFormat: true,
      gradedItemIdsJson: true,
      items: {
        where: { archivedAt: null },
        select: { id: true, title: true, isRequired: true },
      },
    },
  });
  const quizItem = progressionSettings?.items.find((item) => item.title === quizMaterialTitle);

  expect(progressionSettings?.navigationMode).toBe("SEQUENTIAL");
  expect(progressionSettings?.completionMode).toBe("REQUIRED_ITEMS");
  expect(progressionSettings?.statusFormat).toBe("PASSED_WITH_SCORE");
  expect(progressionSettings?.items.every((item) => item.isRequired)).toBe(true);
  expect(progressionSettings?.gradedItemIdsJson).toBe(JSON.stringify([quizItem?.id]));

  const uploadedVideoTitle = `Видео ${uniqueSuffix}`;
  await page.getByRole("button", { name: "Добавить" }).first().click();
  let addPanel = page.getByRole("dialog", { name: "Добавить в курс" });
  await addPanel.getByRole("button", { name: /^Быстро загрузить файл/ }).click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await addPanel.getByRole("button", { name: "Выбрать файл" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: `${uploadedVideoTitle}.mp4`,
    mimeType: "video/mp4",
    buffer: Buffer.from("fake video content"),
  });

  await expect(page.getByText("Материал добавлен")).toBeVisible();

  const uploadedVideo = await getPrisma().courseItem.findFirst({
    where: {
      courseId: course.id,
      title: uploadedVideoTitle,
      type: "VIDEO",
      archivedAt: null,
    },
    select: {
      fileUrl: true,
      isRequired: true,
      moduleId: true,
    },
  });

  expect(uploadedVideo?.fileUrl).toMatch(/^\/uploads\/[a-z0-9-]+\.mp4$/i);
  expect(uploadedVideo?.isRequired).toBe(true);
  expect(uploadedVideo?.moduleId).toBe(courseModule.id);

  const standaloneVideoTitle = `Одиночный материал ${uniqueSuffix}`;
  await page.goto(`/courses/${singleMaterialCourse.id}/manage?section=structure`);
  await page.getByRole("button", { name: "Добавить" }).first().click();
  addPanel = page.getByRole("dialog", { name: "Добавить в курс" });
  await addPanel.getByRole("button", { name: /^Быстро загрузить файл/ }).click();
  const standaloneFileChooserPromise = page.waitForEvent("filechooser");
  await addPanel.getByRole("button", { name: "Выбрать файл" }).click();
  const standaloneFileChooser = await standaloneFileChooserPromise;
  await standaloneFileChooser.setFiles({
    name: `${standaloneVideoTitle}.mp4`,
    mimeType: "video/mp4",
    buffer: Buffer.from("single material video"),
  });

  await expect(page.getByText("Материал добавлен")).toBeVisible();

  const defaultModule = await getPrisma().courseModule.findFirst({
    where: {
      courseId: singleMaterialCourse.id,
      archivedAt: null,
    },
    select: {
      id: true,
      title: true,
    },
  });
  const standaloneVideo = await getPrisma().courseItem.findFirst({
    where: {
      courseId: singleMaterialCourse.id,
      title: standaloneVideoTitle,
      type: "VIDEO",
      archivedAt: null,
    },
    select: {
      moduleId: true,
    },
  });

  expect(defaultModule?.title).toBe("Материалы курса");
  expect(standaloneVideo?.moduleId).toBe(defaultModule?.id);
});

test("admin image uploads are normalized for course thumbnail and cover", async ({ page }) => {
  await login(page, ADMIN);

  const thumbnailSource = await sharp({
    create: {
      width: 1000,
      height: 1000,
      channels: 3,
      background: "#0f766e",
    },
  })
    .png()
    .toBuffer();

  const thumbnailResponse = await page.request.post("/api/course-assets", {
    multipart: {
      kind: "thumbnail",
      file: {
        name: "square-thumbnail.png",
        mimeType: "image/png",
        buffer: thumbnailSource,
      },
    },
  });
  expect(thumbnailResponse.ok()).toBe(true);

  const thumbnailPayload = (await thumbnailResponse.json()) as { url: string };
  const thumbnailMeta = await sharp(await readFile(uploadedPublicPath(thumbnailPayload.url))).metadata();
  expect(thumbnailMeta.width).toBe(640);
  expect(thumbnailMeta.height).toBe(360);

  const coverSource = await sharp({
    create: {
      width: 700,
      height: 1200,
      channels: 3,
      background: "#7c3aed",
    },
  })
    .jpeg()
    .toBuffer();

  const coverResponse = await page.request.post("/api/course-assets", {
    multipart: {
      kind: "cover",
      file: {
        name: "vertical-cover.jpg",
        mimeType: "image/jpeg",
        buffer: coverSource,
      },
    },
  });
  expect(coverResponse.ok()).toBe(true);

  const coverPayload = (await coverResponse.json()) as { url: string };
  const coverMeta = await sharp(await readFile(uploadedPublicPath(coverPayload.url))).metadata();
  expect(coverMeta.width).toBe(1920);
  expect(coverMeta.height).toBe(500);
});

test("admin can search all courses and view archived ones", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const courseTitle = `Архивный курс ${uniqueSuffix}`;
  const adminUser = await getPrisma().user.findUnique({
    where: { login: ADMIN.login },
    select: { id: true },
  });

  expect(adminUser?.id).toBeTruthy();

  const course = await getPrisma().course.create({
    data: {
      title: courseTitle,
      description: "Тестовый курс для проверки архива в списке курсов",
      status: "DRAFT",
      ownerId: adminUser!.id,
    },
    select: { id: true },
  });

  await login(page, ADMIN);
  await page.goto(`/courses?q=${encodeURIComponent(courseTitle)}&view=table`);

  await expect(page.getByRole("heading", { name: "Курсы", exact: true })).toBeVisible();
  const hiddenIdHeader = page.locator("table thead th").first();
  await expect(hiddenIdHeader).toHaveText("ID");
  await expect(hiddenIdHeader).toBeHidden();
  await expect(page.getByRole("columnheader", { name: "Курс" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Автор" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Статус" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Элементы" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Записано учеников" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Дата создания" })).toBeVisible();

  const draftRow = page.locator("table tbody tr").filter({ hasText: courseTitle }).first();
  await expect(draftRow).toBeVisible();
  await expect(draftRow).toContainText("Черновик");

  await page.goto(`/courses/${course.id}/manage?section=access`);
  await page.getByRole("button", { name: "Архивировать" }).click();
  await expect(page.getByText("Курс архивирован")).toBeVisible();

  await page.goto(`/courses?q=${encodeURIComponent(courseTitle)}&view=table`);
  const archivedRowInAll = page.locator("table tbody tr").filter({ hasText: courseTitle }).first();
  await expect(archivedRowInAll).toBeVisible();
  await expect(archivedRowInAll).toContainText("Архив");

  await page.goto(`/courses?q=${encodeURIComponent(courseTitle)}&status=archived&view=table`);
  await expect(page.getByRole("heading", { name: "Архивные курсы" })).toBeVisible();
  const archivedRow = page.locator("table tbody tr").filter({ hasText: courseTitle }).first();
  await expect(archivedRow).toBeVisible();
  await expect(archivedRow).toContainText("Архив");
});

test("student can sign in and open an assigned course", async ({ page }) => {
  await login(page, STUDENT);

  await expect(page).toHaveURL(/\/courses/);
  await expect(page.getByRole("heading", { name: "Мои курсы" })).toBeVisible();
  await page.getByRole("link", { name: SEEDED_COURSE_TITLE, exact: true }).click();

  await expect(page).toHaveURL(/\/courses\/[^/]+$/);
  await expect(page.getByRole("heading", { name: SEEDED_COURSE_TITLE })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Содержание курса" })).toBeVisible();
  await expect(page.getByText(/завершено/)).toBeVisible();
});

test("user with a student role can open My courses from staff navigation", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const loginName = `adminstudent${uniqueSuffix}`;
  const password = `adminstudent${uniqueSuffix}`;
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: { id: true },
  });

  expect(course?.id).toBeTruthy();

  const user = await createUserWithRoles({
    login: loginName,
    password,
    email: `adminstudent${uniqueSuffix}@example.com`,
    name: `Админ Ученик ${uniqueSuffix}`,
    roles: [STANDARD_ROLE_NAMES.SYSTEM_ADMIN, STANDARD_ROLE_NAMES.STUDENT],
  });

  await getPrisma().courseUserAssignment.create({
    data: {
      courseId: course!.id,
      userId: user.id,
    },
  });

  await login(page, { login: loginName, password });

  await expect(page.getByRole("link", { name: "Мои курсы" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Курсы", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Мои курсы" }).click();

  await expect(page).toHaveURL(/\/courses\?tab=assigned/);
  await expect(page.getByRole("heading", { name: "Мои курсы" })).toBeVisible();
  await expect(page.getByRole("link", { name: SEEDED_COURSE_TITLE, exact: true })).toBeVisible();
});

test("student can browse course catalog and open course details", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const [adminUser, reviewerA, reviewerB] = await Promise.all([
    getPrisma().user.findUnique({
      where: { login: ADMIN.login },
      select: { id: true, name: true },
    }),
    getPrisma().user.findUnique({
      where: { login: "finansist" },
      select: { id: true },
    }),
    getPrisma().user.findUnique({
      where: { login: "buhgalter" },
      select: { id: true },
    }),
  ]);

  expect(adminUser?.id).toBeTruthy();
  expect(reviewerA?.id).toBeTruthy();
  expect(reviewerB?.id).toBeTruthy();

  const course = await getPrisma().course.create({
    data: {
      title: `Каталог курса ${uniqueSuffix}`,
      description: "Продвинутый курс по управлению проектными знаниями и запуску внутренних программ.",
      requirements: "Нужен опыт участия во внутренних проектах и базовое понимание KPI.",
      targetAudience: "Руководители команд и сотрудники кадрового резерва.",
      category: "MANAGEMENT",
      difficultyLevel: "ADVANCED",
      durationMinutes: 210,
      status: "PUBLISHED",
      publishedAt: new Date(),
      ownerId: adminUser!.id,
      items: {
        create: [
          {
            title: `Модуль 1. Карта компетенций ${uniqueSuffix}`,
            type: "TEXT",
            content: "Разбираем карту ролей и ожиданий.",
            orderIndex: 0,
            isRequired: true,
          },
          {
            title: `Модуль 2. План внедрения ${uniqueSuffix}`,
            type: "TEXT",
            content: "Собираем дорожную карту запуска.",
            orderIndex: 1,
            isRequired: true,
          },
          {
            title: `Модуль 3. Контроль результата ${uniqueSuffix}`,
            type: "TEXT",
            content: "Фиксируем контрольные точки и метрики.",
            orderIndex: 2,
            isRequired: false,
          },
        ],
      },
      feedbacks: {
        create: [
          {
            userId: reviewerA!.id,
            rating: 5,
            comment: "Очень полезный управленческий курс.",
          },
          {
            userId: reviewerB!.id,
            rating: 4,
            comment: "Хорошо структурированная программа.",
          },
        ],
      },
    },
    select: {
      id: true,
      title: true,
    },
  });

  await login(page, STUDENT);
  await page.goto("/courses?tab=catalog");

  await expect(page.getByRole("heading", { name: "Каталог курсов" })).toBeVisible();
  await page.getByRole("combobox", { name: "Категория" }).selectOption("MANAGEMENT");
  await page.getByRole("combobox", { name: "Уровень" }).selectOption("ADVANCED");
  await page.getByRole("combobox", { name: "Длительность" }).selectOption("long");
  await page.getByRole("combobox", { name: "Рейтинг" }).selectOption("4plus");
  await page.getByRole("button", { name: "Применить" }).click();

  const courseCard = page.locator("li").filter({ hasText: course.title }).first();
  await expect(courseCard).toBeVisible();
  await expect(courseCard).toContainText("Управление");
  await expect(courseCard).toContainText("Продвинутый");
  await expect(courseCard).toContainText("3 ч 30 мин");
  await expect(courseCard).toContainText("4.5/5");
  await expect(courseCard).toContainText("После назначения");
  await courseCard.getByRole("link").click();

  await expect(page).toHaveURL(new RegExp(`/courses/${course.id}/about(?:\\?from=catalog)?$`));
  await expect(page.getByRole("heading", { name: course.title })).toBeVisible();
  await expect(
    page.getByText("Продвинутый курс по управлению проектными знаниями и запуску внутренних программ.").first()
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Программа курса" })).toBeVisible();
  await expect(page.getByText(`Модуль 1. Карта компетенций ${uniqueSuffix}`)).toBeVisible();
  await expect(page.getByText(`Модуль 2. План внедрения ${uniqueSuffix}`)).toBeVisible();
  await expect(page.getByText(`Модуль 3. Контроль результата ${uniqueSuffix}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Требования к ученику" })).toBeVisible();
  await expect(page.getByText("Нужен опыт участия во внутренних проектах и базовое понимание KPI.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Целевая аудитория" })).toBeVisible();
  await expect(page.getByText("Руководители команд и сотрудники кадрового резерва.")).toBeVisible();
  await expect(page.getByText("Доступ откроется после назначения")).toBeVisible();
});

test("admin can enable sequential navigation and student resumes from the last opened lesson", async ({ browser }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const studentUser = await getPrisma().user.findUnique({
    where: { login: STUDENT.login },
    select: { id: true },
  });

  expect(studentUser?.id).toBeTruthy();

  const course = await getPrisma().course.create({
    data: {
      title: `Последовательный курс ${uniqueSuffix}`,
      description: "Проверка последовательного открытия уроков.",
      status: "PUBLISHED",
      publishedAt: new Date(),
      navigationMode: "FREE",
      items: {
        create: [
          {
            title: `Последовательный шаг 1 ${uniqueSuffix}`,
            type: "TEXT",
            content: "Сначала изучите первый материал.",
            orderIndex: 0,
            isRequired: true,
          },
          {
            title: `Последовательный шаг 2 ${uniqueSuffix}`,
            type: "TEXT",
            content: "Этот материал откроется после первого.",
            orderIndex: 1,
            isRequired: true,
          },
          {
            title: `Последовательный шаг 3 ${uniqueSuffix}`,
            type: "TEXT",
            content: "Этот материал откроется после второго.",
            orderIndex: 2,
            isRequired: true,
          },
        ],
      },
      directAssignments: {
        create: {
          userId: studentUser!.id,
        },
      },
    },
    select: {
      id: true,
      title: true,
      items: {
        orderBy: { orderIndex: "asc" },
        select: { id: true, title: true },
      },
    },
  });

  const adminContext = await browser.newContext();
  const learnerContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const learnerPage = await learnerContext.newPage();

  try {
    await login(adminPage, ADMIN);
    await adminPage.goto(`/courses/${course.id}/manage?section=basics`);
    await adminPage.waitForLoadState("networkidle");
    const navigationModeSelect = adminPage.locator('select[name="navigationMode"]');
    await navigationModeSelect.selectOption("SEQUENTIAL");
    await expect(navigationModeSelect).toHaveValue("SEQUENTIAL");
    await adminPage.locator("#course-basics-form").evaluate((form) => (form as HTMLFormElement).requestSubmit());

    await expect
      .poll(async () => {
        const updatedCourse = await getPrisma().course.findUnique({
          where: { id: course.id },
          select: { navigationMode: true },
        });
        return updatedCourse?.navigationMode ?? null;
      })
      .toBe("SEQUENTIAL");

    await login(learnerPage, STUDENT);
    await learnerPage.goto(`/courses/${course.id}`);

    await expect(learnerPage.getByRole("heading", { name: course.title })).toBeVisible();
    await expect(learnerPage.getByRole("heading", { name: "Содержание курса" })).toBeVisible();
    await expect(learnerPage.getByRole("heading", { name: `Последовательный шаг 1 ${uniqueSuffix}` })).toBeVisible();
    await expect(learnerPage.getByText("Заблокирован")).toHaveCount(2);

    await learnerPage.getByRole("link", { name: "Начать" }).first().click();
    await expect(learnerPage.getByText("Сначала изучите первый материал.")).toBeVisible();
    await learnerPage.getByRole("button", { name: "Ознакомлен" }).click();
    await expect(learnerPage.getByText("100%")).toBeVisible();
    await learnerPage.reload();

    await learnerPage
      .getByRole("link", { name: new RegExp(`Последовательный шаг 2 ${uniqueSuffix}`) })
      .click();

    await expect(learnerPage.getByText("Этот материал откроется после первого.")).toBeVisible();

    await expect
      .poll(async () => {
        const learnerState = await getPrisma().courseLearnerState.findUnique({
          where: {
            courseId_userId: {
              courseId: course.id,
              userId: studentUser!.id,
            },
          },
          select: { lastOpenedCourseItemId: true },
        });
        return learnerState?.lastOpenedCourseItemId ?? null;
      })
      .toBe(course.items[1]?.id ?? null);

    await learnerPage.goto(`/courses/${course.id}`);
    await expect(
      learnerPage.getByRole("heading", { name: `Последовательный шаг 2 ${uniqueSuffix}` })
    ).toBeVisible();
  } finally {
    await closeContexts([adminContext, learnerContext]);
  }
});

test("student can submit a quiz with a file answer, get pending review status, and see closed-question answers", async ({
  page,
}) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const studentUser = await getPrisma().user.findUnique({
    where: { login: STUDENT.login },
    select: { id: true },
  });

  expect(studentUser?.id).toBeTruthy();

  const course = await getPrisma().course.create({
    data: {
      title: `Тест с файлом ${uniqueSuffix}`,
      description: "Проверка файла и статуса ручной проверки.",
      status: "PUBLISHED",
      publishedAt: new Date(),
      resultViewMode: "SCORE_WITH_ANSWERS",
      directAssignments: {
        create: {
          userId: studentUser!.id,
        },
      },
    },
    select: { id: true, title: true },
  });

  const quizItem = await getPrisma().courseItem.create({
    data: {
      courseId: course.id,
      orderIndex: 1,
      type: "QUIZ",
      title: `Практикум ${uniqueSuffix}`,
      isRequired: true,
    },
    select: { id: true, title: true },
  });

  const quiz = await getPrisma().quiz.create({
    data: {
      courseItemId: quizItem.id,
      description: "Ответьте на закрытый вопрос и приложите файл.",
      maxAttempts: 1,
      minCorrectAnswers: 1,
    },
    select: { id: true },
  });

  const choiceQuestion = await getPrisma().question.create({
    data: {
      quizId: quiz.id,
      orderIndex: 0,
      type: "SINGLE_CHOICE",
      prompt: "Какой вариант правильный?",
      config: JSON.stringify({
        options: ["Верный ответ", "Неверный ответ"],
        correctIndex: 0,
      }),
      points: 1,
    },
    select: { id: true },
  });

  const fileQuestion = await getPrisma().question.create({
    data: {
      quizId: quiz.id,
      orderIndex: 1,
      type: "FILE",
      prompt: "Загрузите итоговый файл",
      config: JSON.stringify({
        allowedExtensions: ["txt"],
        maxFileSizeMb: 1,
      }),
      points: 5,
    },
    select: { id: true },
  });

  await login(page, STUDENT);
  await page.goto(`/courses/${course.id}/quiz/${quiz.id}`);

  await expect(page.getByRole("heading", { name: quizItem.title })).toBeVisible();
  await expect(page.getByText("Попыток использовано: 0/1")).toBeVisible();

  await page.locator('input[type="radio"][value="0"]').check();
  await page.getByRole("button", { name: "Далее" }).click();

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: "wrong.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 wrong"),
  });
  await expect(page.getByText("Разрешены только файлы: TXT")).toBeVisible();

  await fileInput.setInputFiles({
    name: "essay.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Это мой ответ на практическое задание."),
  });

  await expect(page.getByText("Файл прикреплен")).toBeVisible();
  await expect(page.getByRole("link", { name: "essay.txt" })).toBeVisible();

  await Promise.all([
    page.waitForURL(new RegExp(`/courses/${course.id}/quiz/${quiz.id}/result\\?attempt=`)),
    page.getByRole("button", { name: "Закончить тест" }).click(),
  ]);

  await expect(page.getByText("На проверке").first()).toBeVisible();
  await expect(
    page.getByText("Закрытые вопросы проверены сразу, а задания с ручной проверкой сейчас находятся в статусе «На проверке».")
  ).toBeVisible();
  await expect(page.getByText("Правильный ответ: Верный ответ")).toBeVisible();
  await expect(page.getByText("Ответ отправлен преподавателю и будет оценен отдельно.")).toBeVisible();
  await expect(page.getByRole("link", { name: "essay.txt" })).toBeVisible();

  const pendingAttempt = await getPrisma().quizAttempt.findFirst({
    where: {
      quizId: quiz.id,
      userId: studentUser!.id,
    },
    orderBy: { attemptNumber: "desc" },
    select: {
      outcome: true,
      answers: true,
    },
  });

  expect(pendingAttempt?.outcome).toBe("PENDING_REVIEW");
  const storedAnswers = JSON.parse(pendingAttempt?.answers ?? "{}") as Record<string, string>;
  const storedFileAnswer = JSON.parse(storedAnswers[fileQuestion.id] ?? "{}") as {
    url?: string;
    fileName?: string;
  };
  expect(storedAnswers[choiceQuestion.id]).toBe("0");
  expect(storedFileAnswer.fileName).toBe("essay.txt");
  expect(storedFileAnswer.url).toContain("/uploads/quiz-attachments/");

  await page.goto(`/courses/${course.id}/quiz/${quiz.id}`);
  await expect(page.getByText("Новая попытка недоступна, потому что тест уже отправлен на проверку преподавателю.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Открыть отправленную работу" })).toBeVisible();
});

test("course author can review essay and file answers, notify learner, and learner can see the comment", async ({
  browser,
}) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const studentUser = await getPrisma().user.findUnique({
    where: { login: STUDENT.login },
    select: { id: true, email: true, name: true },
  });
  const adminUser = await getPrisma().user.findUnique({
    where: { login: ADMIN.login },
    select: { id: true },
  });

  expect(studentUser?.id).toBeTruthy();
  expect(studentUser?.email).toBeTruthy();
  expect(adminUser?.id).toBeTruthy();

  const course = await getPrisma().course.create({
    data: {
      title: `Проверка заданий ${uniqueSuffix}`,
      description: "Курс для проверки ручной оценки эссе и файла.",
      status: "PUBLISHED",
      publishedAt: new Date(),
      resultViewMode: "FULL_REVIEW",
      ownerId: adminUser!.id,
      directAssignments: {
        create: {
          userId: studentUser!.id,
        },
      },
    },
    select: { id: true, title: true },
  });

  const quizItem = await getPrisma().courseItem.create({
    data: {
      courseId: course.id,
      orderIndex: 1,
      type: "QUIZ",
      title: `Итоговая работа ${uniqueSuffix}`,
      isRequired: true,
    },
    select: { id: true, title: true },
  });

  const quiz = await getPrisma().quiz.create({
    data: {
      courseItemId: quizItem.id,
      description: "Закрытый вопрос, эссе и файл.",
      maxAttempts: 2,
      minCorrectAnswers: 2,
    },
    select: { id: true },
  });

  await getPrisma().question.createMany({
    data: [
      {
        quizId: quiz.id,
        orderIndex: 0,
        type: "SINGLE_CHOICE",
        prompt: "Какой ответ правильный?",
        config: JSON.stringify({
          options: ["Нет", "Да"],
          correctIndex: 1,
        }),
        points: 1,
      },
      {
        quizId: quiz.id,
        orderIndex: 1,
        type: "OPEN",
        prompt: "Кратко опишите выводы по кейсу",
        config: JSON.stringify({
          reviewMode: "MANUAL",
          sampleAnswer: "",
        }),
        points: 2,
      },
      {
        quizId: quiz.id,
        orderIndex: 2,
        type: "FILE",
        prompt: "Приложите расчетный файл",
        config: JSON.stringify({
          allowedExtensions: ["txt"],
          maxFileSizeMb: 1,
        }),
        points: 3,
      },
    ],
  });

  const studentContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const adminPage = await adminContext.newPage();

  try {
    await login(studentPage, STUDENT);
    await studentPage.goto(`/courses/${course.id}/quiz/${quiz.id}`);

    await expect(studentPage.getByRole("heading", { name: quizItem.title })).toBeVisible();
    await studentPage.locator('input[type="radio"][value="1"]').check();
    await studentPage.getByRole("button", { name: "Далее" }).click();
    await studentPage.locator("textarea").fill("Главный вывод: нужен пересмотр лимитов и контроль кассовых разрывов.");
    await studentPage.getByRole("button", { name: "Далее" }).click();
    await studentPage.locator('input[type="file"]').first().setInputFiles({
      name: "calc.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Расчетный файл для ручной проверки."),
    });
    await expect(studentPage.getByText("Файл прикреплен")).toBeVisible();

    await Promise.all([
      studentPage.waitForURL(new RegExp(`/courses/${course.id}/quiz/${quiz.id}/result\\?attempt=`)),
      studentPage.getByRole("button", { name: "Закончить тест" }).click(),
    ]);

    await expect(studentPage.getByText("На проверке").first()).toBeVisible();

    await login(adminPage, ADMIN);
    await adminPage.goto(`/courses/${course.id}/manage?section=reviews`);

    await expect(adminPage.getByRole("heading", { name: "Задания на проверку" })).toBeVisible();
    await expect(
      adminPage.getByLabel("Детали проверки работы").getByRole("heading", { name: studentUser!.name!, exact: true }),
    ).toBeVisible();
    await expect(adminPage.getByText("Кратко опишите выводы по кейсу")).toBeVisible();
    await expect(adminPage.getByText("Главный вывод: нужен пересмотр лимитов и контроль кассовых разрывов.")).toBeVisible();
    await expect(adminPage.getByRole("link", { name: "Открыть файл" })).toBeVisible();

    await adminPage.locator('select[name^="reviewAccepted_"]').first().selectOption("accepted");
    await adminPage.locator('input[name^="reviewPoints_"]').first().fill("2");
    await adminPage.locator('select[name^="reviewAccepted_"]').nth(1).selectOption("rejected");
    await adminPage.locator('input[name^="reviewPoints_"]').nth(1).fill("1");
    await adminPage
      .locator('textarea[name="reviewComment"]')
      .fill("Эссе раскрывает задачу хорошо. По файлу не хватает итоговой сверки, поэтому он не зачтен.");

    await adminPage.getByRole("button", { name: "Сохранить проверку" }).click();

    await expect(adminPage.getByText("Работа проверена и зачтена.")).toBeVisible();
    await expect(adminPage.getByText("Проверено").first()).toBeVisible();
    await expect(adminPage.locator('textarea[name="reviewComment"]')).toHaveValue(
      "Эссе раскрывает задачу хорошо. По файлу не хватает итоговой сверки, поэтому он не зачтен.",
    );

    const reviewedAttempt = await getPrisma().quizAttempt.findFirst({
      where: {
        quizId: quiz.id,
        userId: studentUser!.id,
      },
      orderBy: { attemptNumber: "desc" },
      select: {
        outcome: true,
        reviewComment: true,
        reviewedAt: true,
        manualReviewJson: true,
      },
    });

    expect(reviewedAttempt?.outcome).toBe("PASSED");
    expect(reviewedAttempt?.reviewComment).toContain("Эссе раскрывает задачу хорошо");
    expect(reviewedAttempt?.reviewedAt).not.toBeNull();
    expect(reviewedAttempt?.manualReviewJson).toContain('"accepted":true');
    expect(reviewedAttempt?.manualReviewJson).toContain('"accepted":false');

    const emailPayload = await waitForQuizReviewedEmailPayload(studentUser!.email!);
    expect(emailPayload.courseTitle).toBe(course.title);
    expect(emailPayload.quizTitle).toBe(quizItem.title);
    expect(emailPayload.outcome).toBe("PASSED");
    expect(emailPayload.reviewComment).toContain("Эссе раскрывает задачу хорошо");

    await studentPage.goto(`/courses/${course.id}/quiz/${quiz.id}`);
    await expect(studentPage).toHaveURL(new RegExp(`/courses/${course.id}/quiz/${quiz.id}/result\\?attempt=`));
    await expect(studentPage.getByText("Проверка преподавателя завершена.")).toBeVisible();
    await expect(studentPage.getByText("Комментарий преподавателя")).toBeVisible();
    await expect(studentPage.getByText("Эссе раскрывает задачу хорошо. По файлу не хватает итоговой сверки, поэтому он не зачтен.")).toBeVisible();
    await expect(studentPage.getByText("Решение: зачтено")).toBeVisible();
    await expect(studentPage.getByText("Решение: не зачтено")).toBeVisible();
    await expect(studentPage.getByText("Баллы: 2/2")).toBeVisible();
    await expect(studentPage.getByText("Баллы: 1/3")).toBeVisible();
  } finally {
    await closeContexts([studentContext, adminContext]);
  }
});

test("hr can open course analytics summary and drill down to expired access", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: { id: true },
  });
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });

  expect(course?.id).toBeTruthy();
  expect(studentRoleProfile?.id).toBeTruthy();

  const expiredLearner = await getPrisma().user.create({
    data: {
      name: `Истекший Ученик ${uniqueSuffix}`,
      login: `expired${uniqueSuffix}`,
      email: `expired${uniqueSuffix}@example.com`,
      passwordHash: "e2e-expired-user",
      role: "Ученик",
      status: "ACTIVE",
      userRoles: {
        create: {
          roleProfileId: studentRoleProfile!.id,
        },
      },
    },
    select: { id: true, name: true },
  });

  await getPrisma().courseUserAssignment.create({
    data: {
      courseId: course!.id,
      userId: expiredLearner.id,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  });

  await login(page, HR);

  await expect(page.getByRole("link", { name: "Аналитика", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Аналитика", exact: true }).click();

  await expect(page).toHaveURL(/\/analytics\?tab=courses|\/analytics$/);
  await expect(page.getByRole("heading", { name: "Аналитика" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Сводка по курсам" })).toBeVisible();
  await expect(page.getByText("Всего записано").first()).toBeVisible();
  await expect(page.getByText("Истек доступ").first()).toBeVisible();

  const courseRow = page.locator("table tbody tr").filter({ hasText: SEEDED_COURSE_TITLE }).first();
  await expect(courseRow).toBeVisible();
  const expiredAccessLink = courseRow.locator('a[href*="access=expired"]').first();
  await expect(expiredAccessLink).toBeVisible();
  await expiredAccessLink.click();

  await expect(page).toHaveURL(/\/courses\/[^/]+\/learners\?access=expired$/);
  await expect(page.getByRole("heading", { name: SEEDED_COURSE_TITLE })).toBeVisible();
  await expect(page.getByRole("link", { name: /Истек \(\d+\)/ })).toBeVisible();
  await expect(page.getByRole("link", { name: expiredLearner.name })).toBeVisible();
});

test("hr analytics shows average grade and monthly completions for filtered courses", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const courseTitle = `HR аналитика ${uniqueSuffix}`;
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });

  expect(studentRoleProfile?.id).toBeTruthy();

  const course = await getPrisma().course.create({
    data: {
      title: courseTitle,
      description: "Курс для проверки HR-аналитики по прогрессу и оценкам",
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  const pdfItem = await getPrisma().courseItem.create({
    data: {
      courseId: course.id,
      orderIndex: 1,
      type: "PDF",
      title: "Презентация",
      content: "Материал",
      isRequired: true,
    },
    select: { id: true },
  });
  const videoItem = await getPrisma().courseItem.create({
    data: {
      courseId: course.id,
      orderIndex: 2,
      type: "VIDEO",
      title: "Видео",
      content: "Видео",
      isRequired: true,
    },
    select: { id: true },
  });
  const quizItem = await getPrisma().courseItem.create({
    data: {
      courseId: course.id,
      orderIndex: 3,
      type: "QUIZ",
      title: "Итоговый тест",
      isRequired: true,
    },
    select: { id: true },
  });
  const quiz = await getPrisma().quiz.create({
    data: {
      courseItemId: quizItem.id,
      minCorrectAnswers: 1,
      maxAttempts: 2,
    },
    select: { id: true },
  });

  await getPrisma().question.create({
    data: {
      quizId: quiz.id,
      orderIndex: 1,
      type: "single",
      prompt: "Вопрос",
      config: JSON.stringify({
        options: [
          { id: "a", text: "Да", isCorrect: true },
          { id: "b", text: "Нет", isCorrect: false },
        ],
      }),
      points: 5,
    },
  });

  const completedLearner = await getPrisma().user.create({
    data: {
      name: `Аналитика Завершил ${uniqueSuffix}`,
      login: `hranalyticsdone${uniqueSuffix}`,
      email: `hranalyticsdone${uniqueSuffix}@example.com`,
      passwordHash: "hr-analytics-done",
      role: "Ученик",
      status: "ACTIVE",
      userRoles: {
        create: {
          roleProfileId: studentRoleProfile!.id,
        },
      },
    },
    select: { id: true },
  });
  const partialLearner = await getPrisma().user.create({
    data: {
      name: `Аналитика В процессе ${uniqueSuffix}`,
      login: `hranalyticspart${uniqueSuffix}`,
      email: `hranalyticspart${uniqueSuffix}@example.com`,
      passwordHash: "hr-analytics-part",
      role: "Ученик",
      status: "ACTIVE",
      userRoles: {
        create: {
          roleProfileId: studentRoleProfile!.id,
        },
      },
    },
    select: { id: true },
  });

  await getPrisma().courseUserAssignment.createMany({
    data: [
      { courseId: course.id, userId: completedLearner.id },
      { courseId: course.id, userId: partialLearner.id },
    ],
  });

  const completionMoment = new Date();
  const earlierMoment = new Date(completionMoment.getTime() - 60 * 60 * 1000);

  await getPrisma().courseItemView.createMany({
    data: [
      {
        courseItemId: pdfItem.id,
        userId: completedLearner.id,
        progressPercent: 100,
        viewedAt: earlierMoment,
      },
      {
        courseItemId: videoItem.id,
        userId: completedLearner.id,
        progressPercent: 100,
        viewedAt: completionMoment,
      },
      {
        courseItemId: pdfItem.id,
        userId: partialLearner.id,
        progressPercent: 100,
        viewedAt: completionMoment,
      },
    ],
  });

  await getPrisma().quizAttempt.create({
    data: {
      quizId: quiz.id,
      userId: completedLearner.id,
      attemptNumber: 1,
      answers: JSON.stringify({ 0: "a" }),
      questionSnapshot: JSON.stringify([{ prompt: "Вопрос" }]),
      score: 4,
      maxScore: 5,
      correctAnswers: 1,
      totalQuestions: 1,
      outcome: "PASSED",
      completedAt: completionMoment,
    },
  });

  await login(page, HR);
  await page.goto(`/analytics?tab=courses&q=${encodeURIComponent(courseTitle)}`);

  await expect(page.getByRole("heading", { name: "Сводка по курсам" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Завершения по месяцам" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Средняя оценка" })).toBeVisible();

  const courseRow = page.locator("table tbody tr").filter({ hasText: courseTitle }).first();
  await expect(courseRow).toBeVisible();
  await expect(courseRow).toContainText("2");
  await expect(courseRow).toContainText("1 (50%)");
  await expect(courseRow).toContainText("66.5%");
  await expect(courseRow).toContainText("80%");
  await expect(page.getByLabel(/Завершения .*: 1/)).toBeVisible();
});

test("hr can filter published courses by category and difficulty and open learners list", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const publishedCourse = await getPrisma().course.create({
    data: {
      title: `HR курс ${uniqueSuffix}`,
      description: "Курс для проверки HR-фильтров",
      status: "PUBLISHED",
      category: "HR",
      difficultyLevel: "INTERMEDIATE",
      durationMinutes: 135,
    },
    select: { id: true, title: true },
  });

  await getPrisma().course.create({
    data: {
      title: `Черновик HR ${uniqueSuffix}`,
      description: "Этот курс не должен показываться HR в каталоге",
      status: "DRAFT",
      category: "HR",
      difficultyLevel: "INTERMEDIATE",
      durationMinutes: 90,
    },
  });

  await login(page, HR);
  await page.goto("/courses");

  await expect(page.getByRole("heading", { name: "Курсы для назначения" })).toBeVisible();
  await expect(page.getByText("Показаны только опубликованные курсы.")).toBeVisible();

  const publishedRow = page.locator("table tbody tr").filter({ hasText: publishedCourse.title }).first();
  await expect(publishedRow).toBeVisible();
  await expect(publishedRow).toContainText("HR");
  await expect(publishedRow).toContainText("Средний");
  await expect(publishedRow).toContainText("2 ч 15 мин");
  await expect(page.locator("table tbody tr").filter({ hasText: `Черновик HR ${uniqueSuffix}` })).toHaveCount(0);

  await page.getByLabel("Категория курса").selectOption("HR");
  await page.getByLabel("Уровень сложности").selectOption("INTERMEDIATE");
  await page.getByLabel("Поиск по названию").fill(publishedCourse.title);
  await page.getByRole("button", { name: "Применить" }).click();

  await expect(page).toHaveURL(/\/courses\?/);
  await expect(page).toHaveURL(/category=HR/);
  await expect(page).toHaveURL(/difficulty=INTERMEDIATE/);
  await expect(publishedRow).toBeVisible();
  await expect(publishedRow.getByRole("link", { name: "Отчет Excel" })).toHaveAttribute(
    "href",
    `/courses/${publishedCourse.id}/results/export?format=xlsx`
  );

  const downloadPromise = page.waitForEvent("download");
  await publishedRow.getByRole("link", { name: "Отчет CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("-results.csv");

  await publishedRow.getByRole("link", { name: "Ученики" }).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${publishedCourse.id}/learners$`));
  await expect(page.getByRole("heading", { name: publishedCourse.title })).toBeVisible();
});

test("hr can open learner drill-down from course learners", async ({ page }) => {
  await login(page, HR);
  await page.goto(`/courses?q=${encodeURIComponent(SEEDED_COURSE_TITLE)}`);

  const courseRow = page.locator("table tbody tr").filter({ hasText: SEEDED_COURSE_TITLE }).first();
  await expect(courseRow).toBeVisible();
  await courseRow.getByRole("link", { name: "Ученики" }).click();

  await expect(page).toHaveURL(/\/courses\/[^/]+\/learners/);
  const learnerLink = page.getByRole("link", { name: "Финансист1" });
  await expect(learnerLink).toBeVisible();
  await learnerLink.click();

  await expect(page).toHaveURL(/\/courses\/[^/]+\/learners\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Финансист1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Карточка ученика" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Элементы курса" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "История попыток" })).toBeVisible();
});

test("hr can review learner assessment details and export detailed grades", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const courseTitle = `HR оценки ${uniqueSuffix}`;
  const reviewComment = "Эссе принято: структура сильная, но выводы можно сделать короче.";
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });
  const adminUser = await getPrisma().user.findUnique({
    where: { login: ADMIN.login },
    select: { id: true },
  });

  expect(studentRoleProfile?.id).toBeTruthy();
  expect(adminUser?.id).toBeTruthy();

  const course = await getPrisma().course.create({
    data: {
      title: courseTitle,
      description: "Курс для проверки HR-детализации результатов и экспорта оценок.",
      status: "PUBLISHED",
      publishedAt: new Date(),
      ownerId: adminUser!.id,
      items: {
        create: [
          {
            title: `Тест по бюджету ${uniqueSuffix}`,
            type: "QUIZ",
            orderIndex: 0,
            isRequired: true,
            quiz: {
              create: {
                maxAttempts: 2,
                minCorrectAnswers: 2,
                questions: {
                  create: [
                    {
                      orderIndex: 0,
                      type: "SINGLE_CHOICE",
                      prompt: "Какой отчет отвечает за план-факт?",
                      config: JSON.stringify({
                        options: ["P&L", "Баланс"],
                        correctOptionIndex: 0,
                      }),
                      points: 1,
                    },
                    {
                      orderIndex: 1,
                      type: "SINGLE_CHOICE",
                      prompt: "Что показывает cash flow?",
                      config: JSON.stringify({
                        options: ["Денежные потоки", "Себестоимость"],
                        correctOptionIndex: 0,
                      }),
                      points: 1,
                    },
                  ],
                },
              },
            },
          },
          {
            title: `Эссе по кейсу ${uniqueSuffix}`,
            type: "QUIZ",
            orderIndex: 1,
            isRequired: true,
            quiz: {
              create: {
                maxAttempts: 1,
                minCorrectAnswers: 1,
                questions: {
                  create: [
                    {
                      orderIndex: 0,
                      type: "OPEN",
                      prompt: "Кратко опишите, как вы стабилизируете бюджет.",
                      config: JSON.stringify({
                        reviewMode: "MANUAL",
                        sampleAnswer: "",
                      }),
                      points: 3,
                    },
                  ],
                },
              },
            },
          },
          {
            title: `Файл с расчетом ${uniqueSuffix}`,
            type: "QUIZ",
            orderIndex: 2,
            isRequired: true,
            quiz: {
              create: {
                maxAttempts: 1,
                minCorrectAnswers: 1,
                questions: {
                  create: [
                    {
                      orderIndex: 0,
                      type: "FILE",
                      prompt: "Загрузите файл с расчетом бюджета.",
                      config: JSON.stringify({
                        allowedExtensions: ["xlsx"],
                        maxFileSizeMb: 5,
                      }),
                      points: 2,
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    },
    select: { id: true },
  });

  const createdItems = await getPrisma().courseItem.findMany({
    where: { courseId: course.id },
    orderBy: { orderIndex: "asc" },
    select: {
      title: true,
      quiz: {
        select: {
          id: true,
          minCorrectAnswers: true,
          questions: {
            orderBy: { orderIndex: "asc" },
            select: {
              id: true,
              orderIndex: true,
              type: true,
              prompt: true,
              config: true,
              points: true,
            },
          },
        },
      },
    },
  });

  const autoQuiz = createdItems[0]!;
  const reviewedAssignment = createdItems[1]!;
  const pendingAssignment = createdItems[2]!;

  expect(autoQuiz.quiz?.id).toBeTruthy();
  expect(reviewedAssignment.quiz?.id).toBeTruthy();
  expect(pendingAssignment.quiz?.id).toBeTruthy();

  const learner = await getPrisma().user.create({
    data: {
      name: `HR ученик ${uniqueSuffix}`,
      login: `hr-grade-${uniqueSuffix}`,
      email: `hr-grade-${uniqueSuffix}@example.com`,
      passwordHash: "hr-grade-password",
      role: "Ученик",
      status: "ACTIVE",
      userRoles: {
        create: {
          roleProfileId: studentRoleProfile!.id,
        },
      },
    },
    select: { id: true, name: true },
  });

  await getPrisma().courseUserAssignment.create({
    data: {
      courseId: course.id,
      userId: learner.id,
    },
  });

  const autoSnapshot = JSON.stringify(
    autoQuiz.quiz!.questions.map((question) => ({
      id: question.id,
      orderIndex: question.orderIndex,
      type: question.type,
      prompt: question.prompt,
      config: question.config,
      points: question.points,
    }))
  );
  const reviewedSnapshot = JSON.stringify(
    reviewedAssignment.quiz!.questions.map((question) => ({
      id: question.id,
      orderIndex: question.orderIndex,
      type: question.type,
      prompt: question.prompt,
      config: question.config,
      points: question.points,
    }))
  );
  const pendingSnapshot = JSON.stringify(
    pendingAssignment.quiz!.questions.map((question) => ({
      id: question.id,
      orderIndex: question.orderIndex,
      type: question.type,
      prompt: question.prompt,
      config: question.config,
      points: question.points,
    }))
  );

  await getPrisma().quizAttempt.create({
    data: {
      quizId: autoQuiz.quiz!.id,
      userId: learner.id,
      attemptNumber: 1,
      answers: JSON.stringify({
        [autoQuiz.quiz!.questions[0]!.id]: "0",
        [autoQuiz.quiz!.questions[1]!.id]: "0",
      }),
      questionSnapshot: autoSnapshot,
      score: 2,
      maxScore: 2,
      correctAnswers: 2,
      totalQuestions: 2,
      outcome: "PASSED",
      completedAt: new Date(),
    },
  });

  await getPrisma().quizAttempt.create({
    data: {
      quizId: reviewedAssignment.quiz!.id,
      userId: learner.id,
      attemptNumber: 1,
      answers: JSON.stringify({
        [reviewedAssignment.quiz!.questions[0]!.id]:
          "Сначала фиксирую лимиты, затем выношу контроль расходов в еженедельный ритм.",
      }),
      questionSnapshot: reviewedSnapshot,
      score: 3,
      maxScore: 3,
      correctAnswers: 1,
      totalQuestions: 1,
      outcome: "PASSED",
      manualReviewJson: JSON.stringify({
        [reviewedAssignment.quiz!.questions[0]!.id]: {
          accepted: true,
          awardedPoints: 3,
        },
      }),
      reviewComment,
      reviewedAt: new Date(),
      reviewedById: adminUser!.id,
      reviewedByName: "Администратор",
      completedAt: new Date(),
    },
  });

  await getPrisma().quizAttempt.create({
    data: {
      quizId: pendingAssignment.quiz!.id,
      userId: learner.id,
      attemptNumber: 1,
      answers: JSON.stringify({
        [pendingAssignment.quiz!.questions[0]!.id]: JSON.stringify({
          url: `/uploads/quiz-attachments/hr-grade-${uniqueSuffix}.xlsx`,
          fileName: `hr-grade-${uniqueSuffix}.xlsx`,
          size: 1024,
        }),
      }),
      questionSnapshot: pendingSnapshot,
      score: 0,
      maxScore: 2,
      correctAnswers: 0,
      totalQuestions: 1,
      outcome: "PENDING_REVIEW",
      completedAt: new Date(),
    },
  });

  await login(page, HR);
  await page.goto(`/courses/${course.id}/learners/${learner.id}`);

  const resultsSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Результаты тестов и заданий" }) })
    .first();
  await expect(resultsSection).toBeVisible();
  await expect(resultsSection).toContainText(autoQuiz.title);
  await expect(resultsSection).toContainText("2 из 2");
  await expect(resultsSection).toContainText(reviewedAssignment.title);
  await expect(resultsSection).toContainText(reviewComment);
  await expect(resultsSection).toContainText("Проверено");
  await expect(resultsSection).toContainText(pendingAssignment.title);
  await expect(resultsSection).toContainText("На проверке");

  const historySection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "История попыток" }) })
    .first();
  await expect(historySection).toContainText(reviewComment);
  await expect(historySection).toContainText("2 из 2");

  await page.goto(`/courses/${course.id}/results`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Экспорт CSV" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const csv = await readFile(downloadPath!, "utf8");

  expect(download.suggestedFilename()).toContain("-results.csv");
  expect(csv).toContain(courseTitle);
  expect(csv).toContain(autoQuiz.title);
  expect(csv).toContain(reviewedAssignment.title);
  expect(csv).toContain(pendingAssignment.title);
  expect(csv).toContain(reviewComment);
  expect(csv).toContain("Проверено");
  expect(csv).toContain("На проверке");
});

test("hr can filter course learners by mvp statuses, sort them, and see last visit", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const courseTitle = `HR ученики ${uniqueSuffix}`;
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });

  expect(studentRoleProfile?.id).toBeTruthy();

  const course = await getPrisma().course.create({
    data: {
      title: courseTitle,
      description: "Курс для проверки MVP-списка учеников",
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  const pdfItem = await getPrisma().courseItem.create({
    data: {
      courseId: course.id,
      orderIndex: 1,
      type: "PDF",
      title: "Презентация",
      content: "Материал",
      isRequired: true,
    },
    select: { id: true },
  });
  const videoItem = await getPrisma().courseItem.create({
    data: {
      courseId: course.id,
      orderIndex: 2,
      type: "VIDEO",
      title: "Видео",
      content: "Видео",
      isRequired: true,
    },
    select: { id: true },
  });
  const quizItem = await getPrisma().courseItem.create({
    data: {
      courseId: course.id,
      orderIndex: 3,
      type: "QUIZ",
      title: "Итоговый тест",
      isRequired: true,
    },
    select: { id: true },
  });
  const quiz = await getPrisma().quiz.create({
    data: {
      courseItemId: quizItem.id,
      minCorrectAnswers: 1,
      maxAttempts: 2,
    },
    select: { id: true },
  });

  await getPrisma().question.create({
    data: {
      quizId: quiz.id,
      orderIndex: 1,
      type: "single",
      prompt: "Вопрос",
      config: JSON.stringify({
        options: [
          { id: "a", text: "Да", isCorrect: true },
          { id: "b", text: "Нет", isCorrect: false },
        ],
      }),
      points: 5,
    },
  });

  const activeLearner = await getPrisma().user.create({
    data: {
      name: `HR Активный ${uniqueSuffix}`,
      login: `hractive${uniqueSuffix}`,
      email: `hractive${uniqueSuffix}@example.com`,
      passwordHash: "hr-active",
      role: "Ученик",
      status: "ACTIVE",
      userRoles: {
        create: {
          roleProfileId: studentRoleProfile!.id,
        },
      },
    },
    select: { id: true, name: true },
  });
  const completedLearner = await getPrisma().user.create({
    data: {
      name: `HR Завершил ${uniqueSuffix}`,
      login: `hrdone${uniqueSuffix}`,
      email: `hrdone${uniqueSuffix}@example.com`,
      passwordHash: "hr-done",
      role: "Ученик",
      status: "ACTIVE",
      userRoles: {
        create: {
          roleProfileId: studentRoleProfile!.id,
        },
      },
    },
    select: { id: true, name: true },
  });
  const droppedLearner = await getPrisma().user.create({
    data: {
      name: `HR Бросил ${uniqueSuffix}`,
      login: `hrdrop${uniqueSuffix}`,
      email: `hrdrop${uniqueSuffix}@example.com`,
      passwordHash: "hr-drop",
      role: "Ученик",
      status: "ACTIVE",
      userRoles: {
        create: {
          roleProfileId: studentRoleProfile!.id,
        },
      },
    },
    select: { id: true, name: true },
  });

  await getPrisma().courseUserAssignment.createMany({
    data: [
      { courseId: course.id, userId: activeLearner.id },
      { courseId: course.id, userId: completedLearner.id },
      {
        courseId: course.id,
        userId: droppedLearner.id,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    ],
  });

  const droppedVisitAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const activeVisitAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const completedVisitAt = new Date(Date.now() - 6 * 60 * 60 * 1000);

  await getPrisma().courseItemView.createMany({
    data: [
      {
        courseItemId: pdfItem.id,
        userId: activeLearner.id,
        progressPercent: 60,
        viewedAt: activeVisitAt,
      },
      {
        courseItemId: pdfItem.id,
        userId: completedLearner.id,
        progressPercent: 100,
        viewedAt: new Date(completedVisitAt.getTime() - 60 * 60 * 1000),
      },
      {
        courseItemId: videoItem.id,
        userId: completedLearner.id,
        progressPercent: 100,
        viewedAt: completedVisitAt,
      },
      {
        courseItemId: pdfItem.id,
        userId: droppedLearner.id,
        progressPercent: 30,
        viewedAt: droppedVisitAt,
      },
    ],
  });

  await getPrisma().quizAttempt.create({
    data: {
      quizId: quiz.id,
      userId: completedLearner.id,
      attemptNumber: 1,
      answers: JSON.stringify({ 0: "a" }),
      questionSnapshot: JSON.stringify([{ prompt: "Вопрос" }]),
      score: 4,
      maxScore: 5,
      correctAnswers: 1,
      totalQuestions: 1,
      outcome: "PASSED",
      completedAt: completedVisitAt,
    },
  });

  await login(page, HR);
  await page.goto(`/courses/${course.id}/learners`);

  await expect(page.getByRole("heading", { name: courseTitle })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Последний визит/ })).toBeVisible();

  const activeRow = page.locator("table tbody tr").filter({ hasText: activeLearner.name }).first();
  const completedRow = page.locator("table tbody tr").filter({ hasText: completedLearner.name }).first();
  const droppedRow = page.locator("table tbody tr").filter({ hasText: droppedLearner.name }).first();

  await expect(activeRow).toContainText("Активен");
  await expect(activeRow).toContainText(formatDateRu(activeVisitAt));
  await expect(completedRow).toContainText("Завершил");
  await expect(completedRow).toContainText(formatDateRu(completedVisitAt));
  await expect(droppedRow).toContainText("Бросил");
  await expect(droppedRow).toContainText(formatDateRu(droppedVisitAt));

  await page.getByRole("link", { name: "Бросили (1)" }).click();
  await expect(page).toHaveURL(/status=dropped/);
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(page.locator("table tbody tr").first()).toContainText(droppedLearner.name);

  await page.getByRole("link", { name: "Все (3)" }).click();
  await expect(page).not.toHaveURL(/status=dropped/);
  let progressHeader = page.getByRole("link", { name: /Прогресс/ });
  await progressHeader.click();
  await expect(page).toHaveURL(/sortBy=progress/);
  progressHeader = page.getByRole("link", { name: /Прогресс/ });
  await progressHeader.click();
  await expect(page).toHaveURL(/sortDir=desc/);
  await expect(page.locator("table tbody tr").first()).toContainText(completedLearner.name);
});

test("hr can create a student from the restricted invite flow", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const studentName = `Новый Ученик ${uniqueSuffix}`;
  const studentLogin = `student${uniqueSuffix}`;
  const studentEmail = `student${uniqueSuffix}@example.com`;

  await login(page, HR);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Главная HR" })).toBeVisible();
  await page.getByRole("link", { name: "Пользователи" }).click();

  await expect(page.getByRole("heading", { name: "Управление учениками" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Новый ученик" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Роли" })).toHaveCount(0);

  await page.getByRole("link", { name: "Новый ученик" }).click();

  await expect(page.getByRole("heading", { name: "Новый ученик" })).toBeVisible();
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
  await expect(page.locator('input[name="role"]')).toHaveCount(0);
  await expect(page.getByText("Роль:")).toContainText("Ученик");

  await page.getByLabel("Имя пользователя").fill(studentName);
  await page.getByLabel("Логин").fill(studentLogin);
  await page.getByLabel("Email").fill(studentEmail);
  await page.getByRole("button", { name: "Создать ученика и отправить приглашение" }).click();

  await expect(page).toHaveURL(/\/admin\/users-groups\?tab=users/);
  await expect(page.getByText("Ученик создан.")).toBeVisible();

  await page.locator('input[name="q"]').fill(studentLogin);
  await page.getByRole("button", { name: "Применить" }).click();

  await expect(page.getByRole("button", { name: studentName })).toBeVisible();
  await expect(page.getByText(studentEmail)).toBeVisible();
});

test("hr can edit a learner profile from the learner page without access to login, role, or password controls", async ({
  page,
}) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const department = await getPrisma().department.create({
    data: { name: `Редактируемый отдел ${uniqueSuffix}` },
    select: { id: true, name: true },
  });
  const accountingGroup = await getPrisma().group.findFirst({
    where: { name: "Бухгалтерия" },
    select: { id: true, name: true },
  });

  expect(accountingGroup?.id).toBeTruthy();

  const updatedName = `Финансист2 Обновлен ${uniqueSuffix}`;
  const updatedEmail = `finansist2.${uniqueSuffix}@example.com`;

  await login(page, HR);
  await page.goto(`/admin/reports/learner-progress?q=${STUDENT.login}`);

  const learnerRow = page.locator("table tbody tr").filter({ hasText: "Финансист2" }).first();
  await expect(learnerRow).toBeVisible();
  await learnerRow.getByRole("link", { name: "Финансист2" }).click();

  await expect(page.getByRole("link", { name: "Редактировать профиль" })).toBeVisible();
  await page.getByRole("link", { name: "Редактировать профиль" }).click();

  await expect(page).toHaveURL(/\/admin\/users\/[^/]+\/edit$/);
  await expect(page.getByRole("heading", { name: "Редактировать ученика" })).toBeVisible();
  await expect(page.locator('input[name="login"]')).toHaveCount(0);
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
  await expect(page.locator('input[name="role"]')).toHaveCount(0);
  await expect(page.locator('select[name="status"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Сбросить пароль и отправить временный пароль" })).toHaveCount(0);
  await expect(page.getByText("Логин используется для входа на платформу")).toBeVisible();

  await page.getByLabel("Email").fill("finansist1@lms.local");
  await page.getByRole("button", { name: "Сохранить профиль" }).click();

  await expect(page.getByText("Пользователь с таким логином или email уже существует")).toBeVisible();

  await page.getByLabel("Имя и фамилия").fill(updatedName);
  await page.getByLabel("Email").fill(updatedEmail);
  await page.getByLabel("Подразделение").selectOption(department.id);
  await page.getByLabel("Группа").selectOption(accountingGroup!.id);
  await page.getByRole("button", { name: "Сохранить профиль" }).click();

  await expect(page).toHaveURL(/\/admin\/users-groups\?tab=users/);
  await expect(page.getByText("Профиль ученика обновлен.")).toBeVisible();

  await page.locator('input[name="q"]').fill(updatedEmail);
  await page.getByRole("button", { name: "Применить" }).click();

  const updatedRow = page.locator("table tbody tr").filter({ hasText: updatedName }).first();
  await expect(updatedRow).toBeVisible();
  await expect(updatedRow).toContainText(updatedEmail);
  await expect(updatedRow).toContainText(department.name);

  await page.getByRole("button", { name: updatedName }).click();
  await expect(page.locator('input[name="login"]')).toHaveCount(0);
  await expect(page.getByLabel("Имя и фамилия")).toHaveValue(updatedName);
  await expect(page.getByLabel("Email")).toHaveValue(updatedEmail);
  await expect(page.getByLabel("Подразделение")).toHaveValue(department.id);
  await expect(page.getByLabel("Группа")).toHaveValue(accountingGroup!.id);
});

test("hr can create a group, add learners to it, and assign a course by group", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const groupName = `HR группа ${uniqueSuffix}`;
  const groupDescription = "Группа для массовых назначений обязательного курса";
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: { id: true },
  });

  expect(course?.id).toBeTruthy();

  await login(page, HR);
  await page.getByRole("link", { name: "Пользователи" }).click();
  const groupsTabLink = page.locator('a[href="/admin/users-groups?tab=groups"]').first();
  await expect(groupsTabLink).toBeVisible();
  await groupsTabLink.click();

  await expect(page).toHaveURL(/tab=groups/);
  await page.getByRole("button", { name: "Новая группа" }).click();
  await page.locator("#new-group-name").fill(groupName);
  await page.locator("#new-group-description").fill(groupDescription);
  await page.getByRole("button", { name: "Создать" }).click();

  await expect(page.getByText("Группа создана.")).toBeVisible();
  await expect(page.getByRole("heading", { name: groupName })).toBeVisible();
  await expect(page.locator('textarea[name="description"]').first()).toHaveValue(groupDescription);

  await page.getByLabel("Поиск ученика").fill("Финансист");
  await page.getByRole("button", { name: "Найти" }).click();
  await page.getByRole("checkbox", { name: /Финансист1/ }).check();
  await page.getByRole("checkbox", { name: /Финансист3/ }).check();
  await page.getByRole("button", { name: "Сохранить состав группы" }).click();

  await expect(page.getByText("Состав группы обновлен: 2 учеников.")).toBeVisible();
  await expect(page.getByText("Участников: 2")).toBeVisible();

  await page.goto(`/courses/${course!.id}/manage?section=assignments`);
  await expect(page.getByRole("heading", { name: "Назначения", exact: true })).toBeVisible();
  const recipientsDialog = await openAssignmentRecipientsDialog(page);
  await recipientsDialog.getByRole("checkbox", { name: groupName }).check();
  await recipientsDialog.getByRole("button", { name: "Назначить выбранных" }).click();

  await expect(page.getByText("Назначения сохранены.")).toBeVisible();

  await page.goto(`/courses/${course!.id}/learners`);
  await expect(page.locator("table tbody tr").filter({ hasText: "Финансист1" }).first()).toBeVisible();
  await expect(page.locator("table tbody tr").filter({ hasText: "Финансист3" }).first()).toBeVisible();
});

test("hr can review group progress summary, filter by course, compare groups, and export report", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const primaryGroupName = `HR Аналитика ${uniqueSuffix}`;
  const secondaryGroupName = `HR Сравнение ${uniqueSuffix}`;
  const sharedCourseTitle = `HR Shared Course ${uniqueSuffix}`;
  const extraCourseTitle = `HR Extra Course ${uniqueSuffix}`;
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });

  expect(studentRoleProfile?.id).toBeTruthy();

  const [primaryGroup, secondaryGroup] = await Promise.all([
    getPrisma().group.create({
      data: { name: primaryGroupName, description: "Основная группа для аналитики" },
      select: { id: true, name: true },
    }),
    getPrisma().group.create({
      data: { name: secondaryGroupName },
      select: { id: true, name: true },
    }),
  ]);

  const [primaryLearnerA, primaryLearnerB, secondaryLearner] = await Promise.all([
    getPrisma().user.create({
      data: {
        name: `Аналитик A ${uniqueSuffix}`,
        login: `grpaa${uniqueSuffix}`,
        email: `grpaa${uniqueSuffix}@example.com`,
        passwordHash: "group-progress-a",
        role: "Ученик",
        status: "ACTIVE",
        userRoles: {
          create: {
            roleProfileId: studentRoleProfile!.id,
          },
        },
        groupMemberships: {
          create: {
            groupId: primaryGroup.id,
          },
        },
      },
      select: { id: true, name: true },
    }),
    getPrisma().user.create({
      data: {
        name: `Аналитик B ${uniqueSuffix}`,
        login: `grpab${uniqueSuffix}`,
        email: `grpab${uniqueSuffix}@example.com`,
        passwordHash: "group-progress-b",
        role: "Ученик",
        status: "ACTIVE",
        userRoles: {
          create: {
            roleProfileId: studentRoleProfile!.id,
          },
        },
        groupMemberships: {
          create: {
            groupId: primaryGroup.id,
          },
        },
      },
      select: { id: true, name: true },
    }),
    getPrisma().user.create({
      data: {
        name: `Сравнение C ${uniqueSuffix}`,
        login: `grpc${uniqueSuffix}`,
        email: `grpc${uniqueSuffix}@example.com`,
        passwordHash: "group-progress-c",
        role: "Ученик",
        status: "ACTIVE",
        userRoles: {
          create: {
            roleProfileId: studentRoleProfile!.id,
          },
        },
        groupMemberships: {
          create: {
            groupId: secondaryGroup.id,
          },
        },
      },
      select: { id: true, name: true },
    }),
  ]);

  const [sharedCourse, extraCourse] = await Promise.all([
    getPrisma().course.create({
      data: {
        title: sharedCourseTitle,
        status: "PUBLISHED",
        publishedAt: new Date(),
        items: {
          create: {
            orderIndex: 0,
            type: "PDF",
            title: "Общий материал",
            isRequired: true,
          },
        },
      },
      select: {
        id: true,
        title: true,
        items: {
          select: { id: true },
        },
      },
    }),
    getPrisma().course.create({
      data: {
        title: extraCourseTitle,
        status: "PUBLISHED",
        publishedAt: new Date(),
        items: {
          create: {
            orderIndex: 0,
            type: "PDF",
            title: "Дополнительный материал",
            isRequired: true,
          },
        },
      },
      select: {
        id: true,
        title: true,
        items: {
          select: { id: true },
        },
      },
    }),
  ]);

  await getPrisma().courseGroupAssignment.createMany({
    data: [
      { courseId: sharedCourse.id, groupId: primaryGroup.id },
      { courseId: extraCourse.id, groupId: primaryGroup.id },
      { courseId: sharedCourse.id, groupId: secondaryGroup.id },
    ],
  });

  await getPrisma().courseItemView.createMany({
    data: [
      {
        courseItemId: sharedCourse.items[0]!.id,
        userId: primaryLearnerA.id,
        progressPercent: 100,
        viewedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      },
      {
        courseItemId: extraCourse.items[0]!.id,
        userId: primaryLearnerA.id,
        progressPercent: 100,
        viewedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
      {
        courseItemId: sharedCourse.items[0]!.id,
        userId: primaryLearnerB.id,
        progressPercent: 50,
        viewedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
      {
        courseItemId: sharedCourse.items[0]!.id,
        userId: secondaryLearner.id,
        progressPercent: 20,
        viewedAt: new Date(Date.now() - 90 * 60 * 1000),
      },
    ],
  });

  await login(page, HR);
  await page.goto(`/admin/users-groups?tab=groups&groupId=${primaryGroup.id}`);

  await expect(page.getByRole("heading", { name: primaryGroup.name })).toBeVisible();
  const progressSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Прогресс группы" }) }).first();

  await expect(progressSection).toContainText("62.5%");
  await expect(progressSection).toContainText("Место в сравнении:");
  await expect(progressSection).toContainText(primaryLearnerA.name);
  await expect(progressSection.locator("table tbody tr").filter({ hasText: primaryLearnerA.name }).first()).toContainText("Завершил все");
  await expect(progressSection.locator("table tbody tr").filter({ hasText: primaryLearnerB.name }).first()).toContainText("25%");
  await expect(progressSection).toContainText(secondaryGroup.name);
  await expect(progressSection).toContainText("20%");

  await progressSection.getByLabel("Курс").selectOption(sharedCourse.id);
  await progressSection.getByRole("button", { name: "Применить фильтр" }).click();

  await expect(page).toHaveURL(new RegExp(`groupCourseId=${sharedCourse.id}`));
  const filteredProgressSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Прогресс группы" }) })
    .first();

  await expect(filteredProgressSection).toContainText(sharedCourseTitle);
  await expect(filteredProgressSection).toContainText("75%");
  await expect(filteredProgressSection.locator("table tbody tr").filter({ hasText: primaryLearnerB.name }).first()).toContainText("50%");
  await expect(filteredProgressSection.locator("table tbody tr").filter({ hasText: primaryLearnerB.name }).first()).toContainText("В обучении");

  const downloadPromise = page.waitForEvent("download");
  await filteredProgressSection.getByRole("link", { name: "Экспорт CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toContain("group-progress-");
  expect(download.suggestedFilename()).toContain(".csv");

  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const csv = await readFile(downloadPath!, "utf8");
  expect(csv).toContain(primaryGroup.name);
  expect(csv).toContain(sharedCourseTitle);
  expect(csv).toContain(primaryLearnerA.name);
  expect(csv).not.toContain(extraCourseTitle);

  const auditEvent = await waitForAuditLogEvent({
    action: "exports:group_progress",
    objectId: primaryGroup.id,
  });
  expect(auditEvent.objectLabel).toBe(primaryGroup.name);
});

test("hr can send a course message to one assigned group and see it in learner communication history", async ({
  page,
}) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const groupName = `Рассылка группа ${uniqueSuffix}`;
  const messageSubject = `Дедлайн по курсу ${uniqueSuffix}`;
  const messageBody = `Пожалуйста, завершите обязательные материалы до конца недели.\nЕсли есть вопросы, ответьте HR в рабочем чате.`;
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: { id: true, title: true },
  });
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });

  expect(course?.id).toBeTruthy();
  expect(studentRoleProfile?.id).toBeTruthy();

  const group = await getPrisma().group.create({
    data: { name: groupName },
    select: { id: true, name: true },
  });

  const [groupLearnerA, groupLearnerB, directLearner] = await Promise.all([
    getPrisma().user.create({
      data: {
        name: `Рассылка Ученик A ${uniqueSuffix}`,
        login: `mailga${uniqueSuffix}`,
        email: `mailga${uniqueSuffix}@example.com`,
        passwordHash: "mail-group-a",
        role: "Ученик",
        status: "ACTIVE",
        userRoles: {
          create: {
            roleProfileId: studentRoleProfile!.id,
          },
        },
        groupMemberships: {
          create: {
            groupId: group.id,
          },
        },
      },
      select: { id: true, name: true, login: true, email: true },
    }),
    getPrisma().user.create({
      data: {
        name: `Рассылка Ученик B ${uniqueSuffix}`,
        login: `mailgb${uniqueSuffix}`,
        email: `mailgb${uniqueSuffix}@example.com`,
        passwordHash: "mail-group-b",
        role: "Ученик",
        status: "ACTIVE",
        userRoles: {
          create: {
            roleProfileId: studentRoleProfile!.id,
          },
        },
        groupMemberships: {
          create: {
            groupId: group.id,
          },
        },
      },
      select: { id: true, name: true, login: true, email: true },
    }),
    getPrisma().user.create({
      data: {
        name: `Личный Ученик ${uniqueSuffix}`,
        login: `maildirect${uniqueSuffix}`,
        email: `maildirect${uniqueSuffix}@example.com`,
        passwordHash: "mail-direct",
        role: "Ученик",
        status: "ACTIVE",
        userRoles: {
          create: {
            roleProfileId: studentRoleProfile!.id,
          },
        },
      },
      select: { id: true, name: true, login: true, email: true },
    }),
  ]);

  await Promise.all([
    getPrisma().courseGroupAssignment.create({
      data: {
        courseId: course!.id,
        groupId: group.id,
      },
    }),
    getPrisma().courseUserAssignment.create({
      data: {
        courseId: course!.id,
        userId: directLearner.id,
      },
    }),
  ]);

  await login(page, HR);
  await page.goto(`/courses/${course!.id}/manage?section=assignments`);

  await expect(page.getByRole("link", { name: "Отправить сообщение" })).toBeVisible();
  await page.getByRole("link", { name: "Отправить сообщение" }).click();
  await expect(page).toHaveURL(/messaging=1/);

  const messagingSection = page.locator("#course-messaging");
  await expect(messagingSection.getByRole("heading", { name: "Отправить сообщение ученикам" })).toBeVisible();
  await expect(messagingSection).toContainText(groupLearnerA.name);
  await expect(messagingSection).toContainText(groupLearnerB.name);
  await expect(messagingSection).toContainText(directLearner.name);

  await messagingSection.getByLabel("Получатели").selectOption("group");
  await messagingSection.getByLabel("Группа").selectOption(group.id);

  await expect(messagingSection).toContainText(groupLearnerA.name);
  await expect(messagingSection).toContainText(groupLearnerB.name);
  await expect(messagingSection.getByText(directLearner.name)).toHaveCount(0);

  await messagingSection.getByLabel("Тема сообщения").fill(messageSubject);
  await messagingSection.getByLabel("Текст сообщения").fill(messageBody);
  await messagingSection.getByRole("button", { name: "Отправить сообщение" }).click();

  await expect(
    page.getByText(`Сообщение поставлено в очередь для 2 учеников группы «${group.name}».`)
  ).toBeVisible();

  const jobs = await waitForCourseBroadcastEmailJobs(messageSubject, 2);
  expect(jobs.map((job) => job.toEmail).sort()).toEqual([groupLearnerA.email!, groupLearnerB.email!].sort());
  expect(jobs.some((job) => job.toEmail === directLearner.email)).toBeFalsy();

  await page.goto(`/admin/reports/learner-progress?q=${encodeURIComponent(groupLearnerA.login)}`);
  const learnerRow = page.locator("table tbody tr").filter({ hasText: groupLearnerA.name }).first();
  await expect(learnerRow).toBeVisible();
  await learnerRow.getByRole("link", { name: groupLearnerA.name }).click();

  await page.getByRole("link", { name: "Уведомления" }).click();
  await expect(page.getByRole("heading", { name: "История коммуникаций" })).toBeVisible();
  await expect(page.locator("table tbody tr").filter({ hasText: "Массовая рассылка" }).first()).toBeVisible();
  await expect(page.locator("table tbody tr").filter({ hasText: messageSubject }).first()).toBeVisible();
});

test("admin can activate invited user by email link and reset password by email", async ({ browser, page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const userName = `Админ Invite ${uniqueSuffix}`;
  const userLogin = `admininvite${uniqueSuffix}`;
  const userEmail = `admininvite${uniqueSuffix}@example.com`;
  const activatedPassword = "Invite1234";

  await login(page, ADMIN);
  await page.goto("/admin/users/new");

  await expect(page.getByRole("heading", { name: "Новый пользователь" })).toBeVisible();
  await page.getByLabel("Имя пользователя").fill(userName);
  await page.getByLabel("Логин").fill(userLogin);
  await page.getByLabel("Email").fill(userEmail);
  await page.getByRole("button", { name: "Создать и отправить приглашение" }).click();

  await expect(page).toHaveURL(/\/admin\/users-groups\?tab=users/);
  await expect(page.getByText("Пользователь создан. Письмо со ссылкой для активации поставлено в очередь.")).toBeVisible();

  const createPayload = await waitForUserActivationEmailPayload(userEmail);
  expect(createPayload.login).toBe(userLogin);
  expect(createPayload.activationUrl).toContain("/activate/");

  await page.locator('input[name="q"]').fill(userLogin);
  await page.locator('select[name="status"]').selectOption("PENDING");
  await page.getByRole("button", { name: "Применить" }).click();

  const pendingRow = page.locator("table tbody tr").first();
  await expect(pendingRow).toContainText(userName);
  await expect(pendingRow).toContainText("Ожидает подтверждения");

  const activationContext = await browser.newContext();
  try {
    const activationPage = await activationContext.newPage();
    await activationPage.goto(createPayload.activationUrl);
    await expect(activationPage.getByRole("heading", { name: "Задайте пароль" })).toBeVisible();
    await expect(activationPage.getByText(`Логин: ${userLogin}`)).toBeVisible();
    await activationPage.getByLabel("Новый пароль").fill(activatedPassword);
    await Promise.all([
      activationPage.waitForURL(/\/login\?notice=/),
      activationPage.getByRole("button", { name: "Активировать аккаунт" }).click(),
    ]);
    await expect(activationPage.getByText("Активация завершена. Теперь войдите с новым паролем.")).toBeVisible();

    await login(activationPage, { login: userLogin, password: activatedPassword });
    await expect(activationPage).toHaveURL(/\/courses$/);
  } finally {
    await closeContexts([activationContext]);
  }

  await page.goto(`/admin/users-groups?tab=users&q=${encodeURIComponent(userLogin)}&status=ACTIVE`);
  await expect(page.getByRole("button", { name: userName })).toBeVisible();
  await page.getByRole("button", { name: userName }).click();

  await expect(page).toHaveURL(/\/admin\/users\/[^/]+\/edit/);
  await page.getByRole("button", { name: "Сбросить пароль и отправить временный пароль" }).click();

  await expect(page.getByText("Временный пароль сохранен и поставлен в очередь на отправку.")).toBeVisible();

  const resetPayload = await waitForUserAccessEmailPayload(userEmail, "PASSWORD_RESET");
  expect(resetPayload.login).toBe(userLogin);
});

test("admin can filter pending users and first login activates them", async ({ browser, page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const userName = `Ожидает Подтверждения ${uniqueSuffix}`;
  const userLogin = `pendinguser${uniqueSuffix}`;
  const userEmail = `pendinguser${uniqueSuffix}@example.com`;
  const userPassword = "Pending123";

  await login(page, ADMIN);
  await page.goto("/admin/users/new");

  await page.getByLabel("Имя пользователя").fill(userName);
  await page.getByLabel("Логин").fill(userLogin);
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Пароль").fill(userPassword);
  await page.locator('select[name="status"]').selectOption("PENDING");
  await page.getByRole("button", { name: "Создать пользователя" }).click();

  await expect(page).toHaveURL(/\/admin\/users-groups\?tab=users/);
  await expect(page.getByText("Пользователь создан.")).toBeVisible();

  await page.locator('input[name="q"]').fill(userLogin);
  await page.locator('select[name="status"]').selectOption("PENDING");
  await page.getByRole("button", { name: "Применить" }).click();

  await expect(page.locator("table tbody tr")).toHaveCount(1);
  const pendingRow = page.locator("table tbody tr").first();
  await expect(pendingRow).toContainText(userName);
  await expect(pendingRow).toContainText("Ожидает подтверждения");

  const createdUserBeforeLogin = await getPrisma().user.findUnique({
    where: { login: userLogin },
    select: { status: true },
  });
  expect(createdUserBeforeLogin?.status).toBe("PENDING");

  const learnerContext = await browser.newContext();
  try {
    const learnerPage = await learnerContext.newPage();
    await login(learnerPage, { login: userLogin, password: userPassword });
  } finally {
    await closeContexts([learnerContext]);
  }

  const createdUserAfterLogin = await getPrisma().user.findUnique({
    where: { login: userLogin },
    select: {
      status: true,
      loginEvents: {
        select: { id: true },
      },
    },
  });
  expect(createdUserAfterLogin?.status).toBe("ACTIVE");
  expect(createdUserAfterLogin?.loginEvents.length).toBeGreaterThan(0);

  await page.goto(`/admin/users-groups?tab=users&q=${encodeURIComponent(userLogin)}&status=ACTIVE`);
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  const activeRow = page.locator("table tbody tr").first();
  await expect(activeRow).toContainText(userName);
  await expect(activeRow).toContainText("Активен");
});

test("admin can archive user and cannot archive self", async ({ browser, page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const userName = `Архив Пользователь ${uniqueSuffix}`;
  const userLogin = `archiveduser${uniqueSuffix}`;
  const userEmail = `archiveduser${uniqueSuffix}@example.com`;
  const userPassword = "Archive123";
  const adminUser = await getPrisma().user.findUnique({
    where: { login: ADMIN.login },
    select: { id: true },
  });

  expect(adminUser?.id).toBeTruthy();

  await login(page, ADMIN);
  await page.goto("/admin/users/new");

  await page.getByLabel("Имя пользователя").fill(userName);
  await page.getByLabel("Логин").fill(userLogin);
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Пароль").fill(userPassword);
  await page.getByRole("button", { name: "Создать пользователя" }).click();

  await expect(page).toHaveURL(/\/admin\/users-groups\?tab=users/);
  await expect(page.getByText("Пользователь создан.")).toBeVisible();

  await page.locator('input[name="q"]').fill(userLogin);
  await page.getByRole("button", { name: "Применить" }).click();

  const createdUserButton = page.getByRole("button", { name: userName });
  await expect(createdUserButton).toBeVisible();
  await createdUserButton.click();

  await expect(page).toHaveURL(/\/admin\/users\/[^/]+\/edit/);
  const archiveButton = page.getByRole("button", { name: "Архивировать пользователя" });
  await expect(archiveButton).toBeEnabled();
  await archiveButton.click();

  await expect(page).toHaveURL(/\/admin\/users-groups\?tab=users/);
  await expect(page.getByText("Пользователь архивирован.")).toBeVisible();

  const archivedUser = await getPrisma().user.findUnique({
    where: { login: userLogin },
    select: { status: true },
  });
  expect(archivedUser?.status).toBe("ARCHIVED");

  await page.locator('input[name="q"]').fill(userLogin);
  await page.locator('select[name="status"]').selectOption("");
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(page.getByText("Пользователи не найдены.")).toBeVisible();

  await page.locator('select[name="status"]').selectOption("ARCHIVED");
  await page.getByRole("button", { name: "Применить" }).click();
  const archivedRow = page.locator("table tbody tr").first();
  await expect(archivedRow).toContainText(userName);
  await expect(archivedRow).toContainText("Архивирован");

  const archivedContext = await browser.newContext();
  try {
    const archivedPage = await archivedContext.newPage();
    await archivedPage.goto("/login");
    await archivedPage.getByLabel("Логин").fill(userLogin);
    await archivedPage.getByLabel("Пароль").fill(userPassword);
    await archivedPage.getByRole("button", { name: "Войти" }).click();

    await expect(archivedPage).toHaveURL(/\/login/);
    await expect(archivedPage.locator('p[role="alert"]')).toContainText("Неверный логин или пароль.");
  } finally {
    await closeContexts([archivedContext]);
  }

  await page.goto(`/admin/users/${adminUser!.id}/edit`);
  await expect(page.getByRole("button", { name: "Архивировать пользователя" })).toBeDisabled();
  await expect(page.getByText("Нельзя архивировать текущего пользователя.")).toBeVisible();
});

test("admin keeps filled create-user fields after password validation error", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const userName = `Проверка Формы ${uniqueSuffix}`;
  const userLogin = `formcheck${uniqueSuffix}`;
  const userEmail = `formcheck${uniqueSuffix}@example.com`;
  const [group, department] = await Promise.all([
    getPrisma().group.findFirst({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getPrisma().department.findFirst({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  expect(group?.id).toBeTruthy();

  await login(page, ADMIN);
  await page.goto("/admin/users/new");

  await page.getByLabel("Имя пользователя").fill(userName);
  await page.getByLabel("Логин").fill(userLogin);
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Пароль").fill("1234");
  await page.getByLabel("Ученик").uncheck();
  await page.getByLabel("HR-менеджер").check();
  await page.locator('select[name="status"]').selectOption("BLOCKED");
  await page.getByLabel("Группа").selectOption(group!.id);
  if (department?.id) {
    await page.getByLabel("Подразделение").selectOption(department.id);
  }
  await page.getByRole("button", { name: "Создать пользователя" }).click();

  await expect(page.getByText("Пароль должен быть не короче 8 символов.")).toBeVisible();
  await expect(page.getByLabel("Имя пользователя")).toHaveValue(userName);
  await expect(page.getByLabel("Логин")).toHaveValue(userLogin);
  await expect(page.getByLabel("Email")).toHaveValue(userEmail);
  await expect(page.getByLabel("Пароль")).toHaveValue("");
  await expect(page.getByLabel("HR-менеджер")).toBeChecked();
  await expect(page.getByLabel("Ученик")).not.toBeChecked();
  await expect(page.locator('select[name="status"]')).toHaveValue("BLOCKED");
  await expect(page.getByLabel("Группа")).toHaveValue(group!.id);
  if (department?.id) {
    await expect(page.getByLabel("Подразделение")).toHaveValue(department.id);
  } else {
    await expect(page.getByLabel("Подразделение")).toHaveValue("");
  }
});

test("admin can import users from csv with a partial report and archive the imported user", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const importedName = `CSV Пользователь ${uniqueSuffix}`;
  const importedEmail = `csvuser${uniqueSuffix}@example.com`;
  const group = await getPrisma().group.findFirst({
    orderBy: { name: "asc" },
    select: { name: true },
  });
  const department = await getPrisma().department.create({
    data: { name: `CSV отдел ${uniqueSuffix}` },
    select: { id: true, name: true },
  });

  expect(group?.name).toBeTruthy();

  await login(page, ADMIN);
  await page.goto("/admin/users/import");

  await expect(page.getByRole("heading", { name: "Импорт пользователей", exact: true })).toBeVisible();
  await page.getByLabel("CSV-содержимое").fill(
    [
      "email,name,login,role,group,department",
      `${importedEmail},${importedName},,Ученик,${group!.name},${department.name}`,
      "admin@lms.local,CSV Дубликат,,Ученик,,",
    ].join("\n")
  );

  await expect(page.getByText("Готово к импорту: 2")).toBeVisible();
  await page.getByRole("button", { name: "Импортировать 2 строк" }).click();

  await expect(page.getByText("Импорт завершен частично: создано 1, ошибок 1.")).toBeVisible();
  await expect(page.getByText("Пользователь с таким email уже существует.")).toBeVisible();

  const activationPayload = await waitForUserActivationEmailPayload(importedEmail);
  expect(activationPayload.activationUrl).toContain("/activate/");

  const importedUser = await getPrisma().user.findUnique({
    where: { email: importedEmail },
    select: {
      id: true,
      login: true,
      status: true,
      department: {
        select: { name: true },
      },
      groupMemberships: {
        include: {
          group: {
            select: { name: true },
          },
        },
      },
    },
  });

  expect(importedUser?.id).toBeTruthy();
  expect(importedUser?.status).toBe("PENDING");
  expect(importedUser?.login).toContain(`csvuser${uniqueSuffix}`);
  expect(importedUser?.department?.name).toBe(department.name);
  expect(importedUser?.groupMemberships.map((membership) => membership.group.name)).toContain(group!.name);

  await page.goto(`/admin/users-groups?tab=users&q=${encodeURIComponent(importedEmail)}&status=PENDING`);
  const importedUserButton = page.getByRole("button", { name: importedName });
  await expect(importedUserButton).toBeVisible();
  await importedUserButton.click();

  await expect(page).toHaveURL(/\/admin\/users\/[^/]+\/edit/);
  await page.getByRole("button", { name: "Архивировать пользователя" }).click();

  await expect(page).toHaveURL(/\/admin\/users-groups\?tab=users/);
  await expect(page.getByText("Пользователь архивирован.")).toBeVisible();

  const archivedUser = await getPrisma().user.findUnique({
    where: { email: importedEmail },
    select: { status: true },
  });
  expect(archivedUser?.status).toBe("ARCHIVED");
});

test("admin can inspect audit log and export it", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const userName = `Аудит Пользователь ${uniqueSuffix}`;
  const userLogin = `audituser${uniqueSuffix}`;
  const userEmail = `audituser${uniqueSuffix}@example.com`;

  await login(page, ADMIN);
  await page.goto("/admin/users/new");

  await page.getByLabel("Имя пользователя").fill(userName);
  await page.getByLabel("Логин").fill(userLogin);
  await page.getByLabel("Email").fill(userEmail);
  await page.getByRole("button", { name: "Создать и отправить приглашение" }).click();
  await expect(page).toHaveURL(/\/admin\/users-groups\?tab=users/);

  const createdUser = await getPrisma().user.findUnique({
    where: { login: userLogin },
    select: { id: true },
  });
  expect(createdUser?.id).toBeTruthy();

  const createEvent = await waitForAuditLogEvent({ action: "users:create", objectId: createdUser!.id });
  expect(createEvent.objectLabel).toBe(userName);

  await page.goto(`/admin/audit-log?action=users%3Acreate&q=${encodeURIComponent(userLogin)}`);

  await expect(page.getByRole("heading", { name: "Аудит-лог" })).toBeVisible();
  await expect(page.getByLabel("Действие")).toHaveValue("users:create");

  const row = page.locator("table tbody tr").first();
  await expect(row).toContainText("users:create");
  await expect(row).toContainText(userName);
  await expect(row).toContainText("admin");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Экспорт CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("audit-log.csv");
});

test("admin can search users by visible fields and sort by last login", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });

  expect(studentRoleProfile?.id).toBeTruthy();

  const olderLoginAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const newerLoginAt = new Date(Date.now() - 30 * 60 * 1000);

  const [olderUser, newerUser] = await Promise.all([
    getPrisma().user.create({
      data: {
        name: `Список Админ A ${uniqueSuffix}`,
        login: `adminlista${uniqueSuffix}`,
        email: `adminlista${uniqueSuffix}@example.com`,
        passwordHash: "admin-list-a",
        role: "Ученик",
        status: "ACTIVE",
        userRoles: {
          create: {
            roleProfileId: studentRoleProfile!.id,
          },
        },
      },
      select: { id: true, name: true, email: true },
    }),
    getPrisma().user.create({
      data: {
        name: `Список Админ B ${uniqueSuffix}`,
        login: `adminlistb${uniqueSuffix}`,
        email: `adminlistb${uniqueSuffix}@example.com`,
        passwordHash: "admin-list-b",
        role: "Ученик",
        status: "ACTIVE",
        userRoles: {
          create: {
            roleProfileId: studentRoleProfile!.id,
          },
        },
      },
      select: { id: true, name: true, email: true },
    }),
  ]);

  await getPrisma().loginEvent.createMany({
    data: [
      { userId: olderUser.id, createdAt: olderLoginAt },
      { userId: newerUser.id, createdAt: newerLoginAt },
    ],
  });

  await login(page, ADMIN);
  await page.goto(
    `/admin/users-groups?tab=users&q=${encodeURIComponent(uniqueSuffix)}&sortBy=lastLoginAt&sortDir=desc`
  );

  await expect(page.getByText("Последний вход")).toBeVisible();
  const rows = page.locator("table tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(newerUser.name);
  await expect(rows.first()).toContainText(newerUser.email!);
  await expect(rows.first()).toContainText(formatDateTimeRu(newerLoginAt));

  await page.locator('input[name="q"]').fill(olderUser.email!);
  await page.getByRole("button", { name: "Применить" }).click();

  await expect(page.locator("table tbody tr")).toHaveCount(1);
  const searchedRow = page.locator("table tbody tr").first();
  const hiddenUserIdCell = searchedRow.locator("td").nth(1);
  await expect(hiddenUserIdCell).toHaveText(olderUser.id);
  await expect(hiddenUserIdCell).toBeHidden();
  await expect(searchedRow).toContainText(olderUser.email!);
  await expect(searchedRow).toContainText(formatDateTimeRu(olderLoginAt));

  await page.locator('input[name="q"]').fill(olderUser.id);
  await page.getByRole("button", { name: "Применить" }).click();

  await expect(page.getByText("Пользователи не найдены.")).toBeVisible();
});

test("admin keeps course id in markup while hiding it in courses table", async ({ page }) => {
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: {
      id: true,
      title: true,
      createdAt: true,
      owner: {
        select: {
          name: true,
          login: true,
        },
      },
    },
  });

  expect(course?.id).toBeTruthy();

  await login(page, ADMIN);
  await page.goto(`/courses?q=${encodeURIComponent(SEEDED_COURSE_TITLE)}`);

  await expect(page.getByRole("heading", { name: "Курсы", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Все курсы", exact: true })).toBeVisible();
  const hiddenIdHeader = page.locator("table thead th").first();
  await expect(hiddenIdHeader).toHaveText("ID");
  await expect(hiddenIdHeader).toBeHidden();
  await expect(page.getByText("Автор")).toBeVisible();
  await expect(page.getByText("Дата создания")).toBeVisible();

  const courseRow = page.locator("table tbody tr").filter({ hasText: SEEDED_COURSE_TITLE }).first();
  await expect(courseRow).toBeVisible();
  const hiddenIdCell = courseRow.locator("td").first();
  await expect(hiddenIdCell).toHaveText(course!.id);
  await expect(hiddenIdCell).toBeHidden();
  await expect(courseRow).toContainText(course!.owner?.name ?? "Не назначен");
  await expect(courseRow).not.toContainText("Логин:");
  await expect(courseRow).toContainText(formatDateRu(course!.createdAt));
  await expect(courseRow).toContainText("Опубликован");

  await page.goto(`/courses?q=${encodeURIComponent(course!.id)}`);
  await expect(page.getByText(`По запросу «${course!.id}» ничего не найдено.`)).toBeVisible();
});

test("course author can create a modular course, publish it, and keep draft updates hidden until republish", async ({
  browser,
}) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const authorPassword = "Author1234";
  const courseTitle = `Авторский курс ${uniqueSuffix}`;
  const courseDescription = "Курс для проверки публикации автором.";
  const moduleTitle = `Модуль ${uniqueSuffix}`;
  const textLessonTitle = `Введение ${uniqueSuffix}`;
  const initialLessonText = `Первая опубликованная версия ${uniqueSuffix}`;
  const updatedLessonText = `Обновленная версия ${uniqueSuffix}`;
  const quizTitle = `Квиз ${uniqueSuffix}`;
  const questionPrompt = `Контрольный вопрос ${uniqueSuffix}`;
  const contexts: BrowserContext[] = [];

  const author = await createUserWithRoles({
    login: `author${uniqueSuffix}`,
    password: authorPassword,
    email: `author${uniqueSuffix}@example.com`,
    name: `Автор Курса ${uniqueSuffix}`,
    roles: [STANDARD_ROLE_NAMES.COURSE_AUTHOR],
  });

  const learner = await getPrisma().user.findFirst({
    where: { login: STUDENT.login },
    select: { id: true },
  });
  expect(learner?.id).toBeTruthy();

  const authorContext = await browser.newContext();
  contexts.push(authorContext);
  const learnerContext = await browser.newContext();
  contexts.push(learnerContext);

  try {
    const authorPage = await authorContext.newPage();
    const learnerPage = await learnerContext.newPage();

    await login(authorPage, { login: author.login, password: authorPassword });
    await authorPage.goto("/courses/new?mode=blank");

    await authorPage.getByLabel("Название").fill(courseTitle);
    await authorPage.getByLabel("Описание").fill(courseDescription);
    await authorPage.getByText("Дополнительно").click();
    await authorPage.getByLabel("Категория").selectOption("FINANCE");
    await authorPage.getByLabel("Уровень сложности").selectOption("INTERMEDIATE");
    await authorPage.getByLabel("Длительность, часы").fill("2");
    await authorPage.getByLabel("Длительность, минуты").fill("15");
    await authorPage.getByRole("button", { name: "Создать курс" }).click();

    await expect(authorPage).toHaveURL(/\/courses\/[^/]+\/manage\?section=structure/);
    const courseIdMatch = authorPage.url().match(/\/courses\/([^/]+)\/manage/);
    expect(courseIdMatch?.[1]).toBeTruthy();
    const courseId = courseIdMatch![1];

    await authorPage.getByRole("button", { name: "Добавить" }).click();
    let addPanel = authorPage.getByRole("dialog", { name: "Добавить в курс" });
    await addPanel.getByRole("button", { name: /^Раздел/ }).click();
    await addPanel.getByRole("button", { name: "Добавить раздел" }).click();
    await expect(authorPage.getByText("Раздел добавлен")).toBeVisible();

    let moduleSection = authorPage.locator("section").filter({ hasText: "Новый раздел" }).first();
    await expect(moduleSection).toBeVisible();
    await moduleSection.getByRole("link", { name: "Редактировать раздел" }).click();
    const moduleDialog = authorPage.getByRole("dialog", { name: "Новый раздел" });
    await expect(moduleDialog).toBeVisible();
    await moduleDialog.locator('input[name="title"]').fill(moduleTitle);
    await moduleDialog.getByRole("button", { name: "Сохранить раздел" }).click();
    await expect(authorPage.getByText("Раздел сохранен")).toBeVisible();

    moduleSection = authorPage.locator("section").filter({ hasText: moduleTitle }).first();
    await expect(moduleSection).toBeVisible();

    await authorPage.getByRole("button", { name: "Добавить" }).click();
    addPanel = authorPage.getByRole("dialog", { name: "Добавить в курс" });
    await addPanel.getByRole("button", { name: /^Страница/ }).click();
    await addPanel.getByPlaceholder("Название материала").fill(textLessonTitle);
    await addPanel.locator('select[name="moduleId"]').selectOption({ label: moduleTitle });
    const initialLessonHtml = `<h2>Введение</h2><p>${initialLessonText}</p>`;
    await setRichTextContent(
      addPanel.locator('[contenteditable="true"]').first(),
      initialLessonHtml
    );
    await addPanel.locator('input[type="hidden"][name="content"]').evaluate((input, value) => {
      if (input instanceof HTMLInputElement) {
        input.value = value as string;
      }
    }, initialLessonHtml);
    await addPanel.getByRole("button", { name: "Добавить материал" }).click();
    await expect(authorPage.getByText("Материал добавлен")).toBeVisible();
    await expect(authorPage.getByText(textLessonTitle)).toBeVisible();

    await authorPage.getByRole("button", { name: "Добавить" }).click();
    addPanel = authorPage.getByRole("dialog", { name: "Добавить в курс" });
    await addPanel.getByRole("button", { name: /^Тест/ }).click();
    await addPanel.getByPlaceholder("Название материала").fill(quizTitle);
    await addPanel.locator('select[name="moduleId"]').selectOption({ label: moduleTitle });
    await addPanel.getByRole("button", { name: "Добавить материал" }).click();
    await expect(authorPage.getByText("Материал добавлен")).toBeVisible();
    await expect(authorPage.getByText(quizTitle)).toBeVisible();

    await authorPage.getByRole("link", { name: new RegExp(quizTitle) }).click();
    await expect(authorPage).toHaveURL(/\/quiz\/[^/]+\/builder/);
    await expect(authorPage.getByRole("heading", { name: "Добавить вопрос" })).toBeVisible();
    await authorPage.locator('textarea[name="prompt"]').fill(questionPrompt);
    await authorPage.getByPlaceholder("Вариант ответа 1").fill("Верно");
    await authorPage.getByPlaceholder("Вариант ответа 2").fill("Неверно");
    await authorPage.getByLabel("Сделать вариант 1 правильным").check();
    await authorPage.getByRole("button", { name: "Добавить вопрос" }).click();

    await expect(authorPage.getByRole("link", { name: new RegExp(questionPrompt) })).toBeVisible();

    await authorPage.goto(`/courses/${courseId}/manage?section=access`);
    await expect(authorPage.getByRole("button", { name: "Опубликовать" })).toBeVisible();
    await authorPage.getByRole("button", { name: "Опубликовать" }).click();

    await expect(authorPage.getByText("Курс опубликован")).toBeVisible();
    await expect(authorPage.getByText("Опубликован").first()).toBeVisible();

    const createdCourse = await getPrisma().course.findUnique({
      where: { id: courseId },
      select: {
        status: true,
        ownerId: true,
        category: true,
        difficultyLevel: true,
        durationMinutes: true,
        publishedSnapshotJson: true,
        hasUnpublishedChanges: true,
        modules: {
          select: {
            title: true,
          },
        },
        items: {
          where: { archivedAt: null },
          select: {
            title: true,
            type: true,
            content: true,
            quiz: {
              select: {
                questions: {
                  where: { archivedAt: null },
                  select: { prompt: true },
                },
              },
            },
          },
        },
      },
    });

    expect(createdCourse?.ownerId).toBe(author.id);
    expect(createdCourse?.status).toBe("PUBLISHED");
    expect(createdCourse?.category).toBe("FINANCE");
    expect(createdCourse?.difficultyLevel).toBe("INTERMEDIATE");
    expect(createdCourse?.durationMinutes).toBe(135);
    expect(createdCourse?.publishedSnapshotJson).toBeTruthy();
    expect(createdCourse?.hasUnpublishedChanges).toBe(false);
    expect(createdCourse?.modules.some((courseModule) => courseModule.title === moduleTitle)).toBe(true);
    expect(createdCourse?.items.some((item) => item.title === textLessonTitle && item.type === "TEXT")).toBe(true);
    expect(createdCourse?.items.some((item) => item.title === quizTitle && item.type === "QUIZ")).toBe(true);
    expect(createdCourse?.items.some((item) => item.content?.includes(initialLessonText))).toBe(true);
    expect(
      createdCourse?.items.some((item) => item.quiz?.questions.some((question) => question.prompt === questionPrompt))
    ).toBe(true);

    await getPrisma().courseUserAssignment.upsert({
      where: {
        courseId_userId: {
          courseId,
          userId: learner!.id,
        },
      },
      create: {
        courseId,
        userId: learner!.id,
      },
      update: {
        assignedAt: new Date(),
        expiresAt: null,
      },
    });

    await authorPage.getByRole("link", { name: /Структура/ }).click();
    await authorPage.getByRole("link", { name: new RegExp(textLessonTitle) }).first().click();
    const textLessonDialog = authorPage.getByRole("dialog", { name: textLessonTitle });
    await expect(textLessonDialog).toBeVisible();
    const updatedLessonHtml = `<h2>Введение</h2><p>${updatedLessonText}</p>`;
    await setRichTextContent(
      textLessonDialog.locator('[contenteditable="true"]').first(),
      updatedLessonHtml
    );
    await textLessonDialog.locator('input[type="hidden"][name="content"]').evaluate((input, value) => {
      if (input instanceof HTMLInputElement) {
        input.value = value as string;
      }
    }, updatedLessonHtml);
    await textLessonDialog.getByRole("button", { name: "Сохранить материал" }).click();
    await expect(
      authorPage.getByText("Ученики пока видят предыдущую опубликованную версию.")
    ).toBeVisible();

    const draftCourse = await getPrisma().course.findUnique({
      where: { id: courseId },
      select: {
        hasUnpublishedChanges: true,
        publishedSnapshotJson: true,
        items: {
          where: { archivedAt: null },
          select: {
            title: true,
            content: true,
          },
        },
      },
    });

    expect(draftCourse?.hasUnpublishedChanges).toBe(true);
    expect(draftCourse?.publishedSnapshotJson).toBeTruthy();
    expect(draftCourse?.items.some((item) => item.title === textLessonTitle && item.content?.includes(updatedLessonText))).toBe(true);

    await login(learnerPage, STUDENT);
    await learnerPage.goto(`/courses/${courseId}`);
    await learnerPage.getByRole("link", { name: "Начать", exact: true }).click();
    await expect(learnerPage.getByText(initialLessonText)).toBeVisible();
    await expect(learnerPage.getByText(updatedLessonText)).toHaveCount(0);

    await authorPage.getByRole("link", { name: /Управление доступом/ }).click();
    await authorPage.getByRole("button", { name: "Опубликовать" }).click();
    await expect(authorPage.getByText("Курс опубликован")).toBeVisible();

    const republishedCourse = await getPrisma().course.findUnique({
      where: { id: courseId },
      select: {
        hasUnpublishedChanges: true,
        publishedSnapshotJson: true,
      },
    });
    expect(republishedCourse?.hasUnpublishedChanges).toBe(false);
    expect(republishedCourse?.publishedSnapshotJson).toContain(updatedLessonText);

    await learnerPage.goto(`/courses/${courseId}`);
    await learnerPage.getByRole("link", { name: "Начать", exact: true }).click();
    await expect(learnerPage.getByText(updatedLessonText)).toBeVisible();
    await expect(learnerPage.getByText(initialLessonText)).toHaveCount(0);
  } finally {
    await closeContexts(contexts);
  }
});

test("hr can use quick access presets in learners list, set exact date, and extend learner access from the drill-down", async ({ page }) => {
  const exactDate = new Date(Date.now() + 75 * 24 * 60 * 60 * 1000);
  const exactDateInput = toDateInputValue(exactDate);
  const exactDateLabel = formatDateRu(exactDate);

  await login(page, HR);
  await page.goto(`/courses?q=${encodeURIComponent(SEEDED_COURSE_TITLE)}`);

  const courseRow = page.locator("table tbody tr").filter({ hasText: SEEDED_COURSE_TITLE }).first();
  await expect(courseRow).toBeVisible();
  await courseRow.getByRole("link", { name: "Ученики" }).click();

  await expect(page).toHaveURL(/\/courses\/[^/]+\/learners/);
  const courseIdMatch = new URL(page.url()).pathname.match(/\/courses\/([^/]+)\/learners/);
  const courseId = courseIdMatch?.[1] ?? "";
  expect(courseId).not.toBe("");

  await page.getByRole("link", { name: "Назначения", exact: true }).click();
  await expect(page).toHaveURL(/\/courses\/[^/]+\/manage\?section=assignments/);
  const recipientsDialog = await openAssignmentRecipientsDialog(page);
  const accessPicker = await openAssignmentAccessPicker(recipientsDialog);
  await accessPicker.locator('select[name="accessDurationDays"]').selectOption("30");
  await recipientsDialog.getByRole("button", { name: "Назначить выбранных" }).click();

  await expect(page.getByText("Назначения сохранены")).toBeVisible();

  await page.goto(`/courses/${courseId}/learners?access=active`);
  let learnerRow = page.locator("table tbody tr").filter({ hasText: "Финансист1" }).first();
  await expect(learnerRow).toBeVisible();
  await learnerRow.locator("details summary").click();
  await learnerRow.getByRole("button", { name: "+30 дн." }).click();

  await expect(page.getByText(/Доступ продлен до|Доступ восстановлен до/)).toBeVisible();

  learnerRow = page.locator("table tbody tr").filter({ hasText: "Финансист1" }).first();
  await expect(learnerRow).toBeVisible();
  await learnerRow.locator("details summary").click();
  await learnerRow.locator('input[name="accessExpiresOn"]').fill(exactDateInput);
  await learnerRow.getByRole("button", { name: "Сохранить дату" }).click();

  await expect(page.getByText(`Доступ установлен до ${exactDateLabel}.`)).toBeVisible();
  await expect(learnerRow).toContainText(exactDateLabel);

  const learnerLink = learnerRow.getByRole("link", { name: "Финансист1" });
  await expect(learnerLink).toBeVisible();
  await learnerLink.click();

  await expect(page.getByRole("heading", { name: "Доступ к курсу" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Продлить на 30 дней" })).toBeVisible();
  await page.getByRole("button", { name: "Продлить на 30 дней" }).click();

  await expect(page.getByText(/Доступ продлен до|Доступ восстановлен до/)).toBeVisible();
});

test("hr can extend learner access with audit trail and learner email notification", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: { id: true, title: true },
  });
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });

  expect(course?.id).toBeTruthy();
  expect(studentRoleProfile?.id).toBeTruthy();

  const learner = await getPrisma().user.create({
    data: {
      name: `Продление Доступа ${uniqueSuffix}`,
      login: `accessext${uniqueSuffix}`,
      email: `accessext${uniqueSuffix}@example.com`,
      passwordHash: "course-access-extension",
      role: "Ученик",
      status: "ACTIVE",
      userRoles: {
        create: {
          roleProfileId: studentRoleProfile!.id,
        },
      },
    },
    select: { id: true, name: true, email: true },
  });

  const previousAccessDate = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
  const nextAccessDate = new Date(Date.now() + 46 * 24 * 60 * 60 * 1000);
  await getPrisma().courseUserAssignment.create({
    data: {
      courseId: course!.id,
      userId: learner.id,
      expiresAt: previousAccessDate,
    },
  });

  const previousAccessLabel = `До ${formatDateRu(previousAccessDate)}`;
  const nextAccessLabel = `До ${formatDateRu(nextAccessDate)}`;

  await login(page, HR);
  await page.goto(`/courses/${course!.id}/learners/${learner.id}`);

  await expect(page.getByRole("heading", { name: learner.name })).toBeVisible();
  await page.getByLabel("Точная дата окончания доступа").fill(toDateInputValue(nextAccessDate));
  await page.getByRole("button", { name: "Установить дату" }).click();

  await expect(
    page.getByText(`Доступ установлен до ${formatDateRu(nextAccessDate)}. Было: ${previousAccessLabel}. Стало: ${nextAccessLabel}.`)
  ).toBeVisible();
  await expect(page.getByText("Последнее изменение доступа")).toBeVisible();
  await expect(page.getByText(previousAccessLabel, { exact: true })).toBeVisible();
  await expect(page.getByText(nextAccessLabel, { exact: true })).toBeVisible();

  const assignment = await getPrisma().courseUserAssignment.findUnique({
    where: {
      courseId_userId: {
        courseId: course!.id,
        userId: learner.id,
      },
    },
    select: { expiresAt: true },
  });

  expect(assignment?.expiresAt).not.toBeNull();
  expect(toDateInputValue(assignment!.expiresAt!)).toBe(toDateInputValue(nextAccessDate));

  const emailPayload = await waitForCourseAccessExtendedEmailPayload(learner.email!);
  expect(emailPayload.subject).toContain("Срок доступа к курсу обновлен");
  expect(emailPayload.courseId).toBe(course!.id);
  expect(emailPayload.courseTitle).toBe(course!.title);
  expect(emailPayload.previousAccessLabel).toBe(previousAccessLabel);
  expect(emailPayload.nextAccessLabel).toBe(nextAccessLabel);
});

test("hr can unenroll a learner from a course and optionally clear course progress", async ({ browser, page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: { id: true },
  });
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });

  expect(course?.id).toBeTruthy();
  expect(studentRoleProfile?.id).toBeTruthy();

  const learnerPassword = "unenroll123";
  const learnerPasswordHash = await bcrypt.hash(learnerPassword, 10);

  const [directLearner, groupedLearner, group] = await Promise.all([
    getPrisma().user.create({
      data: {
        name: `Отчислить Прямой ${uniqueSuffix}`,
        login: `directdrop${uniqueSuffix}`,
        email: `directdrop${uniqueSuffix}@example.com`,
        passwordHash: learnerPasswordHash,
        role: "Ученик",
        status: "ACTIVE",
        userRoles: {
          create: {
            roleProfileId: studentRoleProfile!.id,
          },
        },
      },
      select: { id: true, name: true, login: true },
    }),
    getPrisma().user.create({
      data: {
        name: `Отчислить Группа ${uniqueSuffix}`,
        login: `groupdrop${uniqueSuffix}`,
        email: `groupdrop${uniqueSuffix}@example.com`,
        passwordHash: learnerPasswordHash,
        role: "Ученик",
        status: "ACTIVE",
        userRoles: {
          create: {
            roleProfileId: studentRoleProfile!.id,
          },
        },
      },
      select: { id: true, name: true, login: true },
    }),
    getPrisma().group.create({
      data: {
        name: `HR Unenroll ${uniqueSuffix}`,
      },
      select: { id: true },
    }),
  ]);

  await Promise.all([
    getPrisma().groupMembership.create({
      data: {
        groupId: group.id,
        userId: groupedLearner.id,
      },
    }),
    getPrisma().courseUserAssignment.create({
      data: {
        courseId: course!.id,
        userId: directLearner.id,
      },
    }),
    getPrisma().courseGroupAssignment.create({
      data: {
        courseId: course!.id,
        groupId: group.id,
      },
    }),
  ]);

  await seedLearnerCourseProgress(course!.id, directLearner.id);
  await seedLearnerCourseProgress(course!.id, groupedLearner.id);

  await login(page, HR);
  await page.goto(`/courses/${course!.id}/learners`);

  const directLearnerRow = page.locator("table tbody tr").filter({ hasText: directLearner.name }).first();
  await expect(directLearnerRow).toBeVisible();
  await directLearnerRow.locator("details summary").click();
  await directLearnerRow.getByRole("button", { name: "Отчислить" }).click();

  const directDialog = page.getByRole("dialog", { name: "Отчислить ученика с курса" });
  await expect(directDialog).toBeVisible();
  await directDialog.getByLabel("Сохранить прогресс по курсу").check();
  await directDialog.getByRole("button", { name: "Подтвердить отчисление" }).click();

  await expect(page.getByText("Ученик отчислен с курса. Прогресс по курсу сохранен.")).toBeVisible();
  await expect(page.locator("table tbody tr").filter({ hasText: directLearner.name })).toHaveCount(0);

  const directAssignment = await getPrisma().courseUserAssignment.findUnique({
    where: {
      courseId_userId: {
        courseId: course!.id,
        userId: directLearner.id,
      },
    },
    select: { userId: true },
  });
  expect(directAssignment).toBeNull();

  const [directViews, directAttempts, directBestResult, directFeedback] = await Promise.all([
    getPrisma().courseItemView.count({
      where: {
        userId: directLearner.id,
        courseItem: {
          courseId: course!.id,
        },
      },
    }),
    getPrisma().quizAttempt.count({
      where: {
        userId: directLearner.id,
        quiz: {
          courseItem: {
            courseId: course!.id,
          },
        },
      },
    }),
    getPrisma().quizUserBestResult.count({
      where: {
        userId: directLearner.id,
        quiz: {
          courseItem: {
            courseId: course!.id,
          },
        },
      },
    }),
    getPrisma().courseFeedback.count({
      where: {
        courseId: course!.id,
        userId: directLearner.id,
      },
    }),
  ]);

  expect(directViews).toBeGreaterThan(0);
  expect(directAttempts).toBeGreaterThan(0);
  expect(directBestResult).toBeGreaterThan(0);
  expect(directFeedback).toBe(1);

  const groupedLearnerRow = page.locator("table tbody tr").filter({ hasText: groupedLearner.name }).first();
  await expect(groupedLearnerRow).toBeVisible();
  await groupedLearnerRow.locator("details summary").click();
  await groupedLearnerRow.getByRole("button", { name: "Отчислить" }).click();

  const groupedDialog = page.getByRole("dialog", { name: "Отчислить ученика с курса" });
  await expect(groupedDialog).toBeVisible();
  await groupedDialog.getByLabel("Удалить прогресс по курсу").check();
  await groupedDialog.getByRole("button", { name: "Подтвердить отчисление" }).click();

  await expect(page.getByText("Ученик отчислен с курса. Прогресс по курсу удален.")).toBeVisible();

  const groupedOverrideAssignment = await getPrisma().courseUserAssignment.findUnique({
    where: {
      courseId_userId: {
        courseId: course!.id,
        userId: groupedLearner.id,
      },
    },
    select: { expiresAt: true },
  });
  expect(groupedOverrideAssignment?.expiresAt).not.toBeNull();
  expect(groupedOverrideAssignment!.expiresAt!.getTime()).toBeLessThan(Date.now());

  const [groupedViews, groupedAttempts, groupedBestResult, groupedFeedback] = await Promise.all([
    getPrisma().courseItemView.count({
      where: {
        userId: groupedLearner.id,
        courseItem: {
          courseId: course!.id,
        },
      },
    }),
    getPrisma().quizAttempt.count({
      where: {
        userId: groupedLearner.id,
        quiz: {
          courseItem: {
            courseId: course!.id,
          },
        },
      },
    }),
    getPrisma().quizUserBestResult.count({
      where: {
        userId: groupedLearner.id,
        quiz: {
          courseItem: {
            courseId: course!.id,
          },
        },
      },
    }),
    getPrisma().courseFeedback.count({
      where: {
        courseId: course!.id,
        userId: groupedLearner.id,
      },
    }),
  ]);

  expect(groupedViews).toBe(0);
  expect(groupedAttempts).toBe(0);
  expect(groupedBestResult).toBe(0);
  expect(groupedFeedback).toBe(0);

  await page.goto(`/courses/${course!.id}/learners?q=${groupedLearner.login}&access=expired`);
  const archivedGroupedRow = page.locator("table tbody tr").filter({ hasText: groupedLearner.name }).first();
  await expect(archivedGroupedRow).toBeVisible();
  await expect(archivedGroupedRow).toContainText("Истек");

  const groupedLearnerContext = await browser.newContext();
  const groupedLearnerPage = await groupedLearnerContext.newPage();

  try {
    await login(groupedLearnerPage, { login: groupedLearner.login, password: learnerPassword });
    await expect(groupedLearnerPage.getByRole("heading", { name: "Мои курсы" })).toBeVisible();
    await expect(groupedLearnerPage.getByRole("link", { name: SEEDED_COURSE_TITLE })).toHaveCount(0);

    await groupedLearnerPage.goto(`/courses/${course!.id}`);
    await expect(groupedLearnerPage).toHaveURL(/\/courses$/);
  } finally {
    await closeContexts([groupedLearnerContext]);
  }
});

test("hr can bulk-manage access for selected learners and direct override beats group access", async ({ browser, page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: { id: true },
  });
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });

  expect(course?.id).toBeTruthy();
  expect(studentRoleProfile?.id).toBeTruthy();

  const overridePassword = "override123";
  const overridePasswordHash = await bcrypt.hash(overridePassword, 10);
  const exactDate = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000);
  const exactDateInput = toDateInputValue(exactDate);
  const exactDateLabel = formatDateRu(exactDate);

  const [directLearner, groupLearner, group] = await Promise.all([
    getPrisma().user.create({
      data: {
        name: `Массовый Прямой ${uniqueSuffix}`,
        login: `bulkdirect${uniqueSuffix}`,
        email: `bulkdirect${uniqueSuffix}@example.com`,
        passwordHash: overridePasswordHash,
        role: "Ученик",
        status: "ACTIVE",
        userRoles: {
          create: {
            roleProfileId: studentRoleProfile!.id,
          },
        },
      },
      select: { id: true, name: true, login: true },
    }),
    getPrisma().user.create({
      data: {
        name: `Массовый Группа ${uniqueSuffix}`,
        login: `bulkgroup${uniqueSuffix}`,
        email: `bulkgroup${uniqueSuffix}@example.com`,
        passwordHash: overridePasswordHash,
        role: "Ученик",
        status: "ACTIVE",
        userRoles: {
          create: {
            roleProfileId: studentRoleProfile!.id,
          },
        },
      },
      select: { id: true, name: true, login: true },
    }),
    getPrisma().group.create({
      data: {
        name: `HR Bulk Access ${uniqueSuffix}`,
      },
      select: { id: true },
    }),
  ]);

  await getPrisma().groupMembership.create({
    data: {
      groupId: group.id,
      userId: groupLearner.id,
    },
  });

  await Promise.all([
    getPrisma().courseUserAssignment.create({
      data: {
        courseId: course!.id,
        userId: directLearner.id,
        expiresAt: null,
      },
    }),
    getPrisma().courseGroupAssignment.create({
      data: {
        courseId: course!.id,
        groupId: group.id,
        expiresAt: null,
      },
    }),
  ]);

  await login(page, HR);
  await page.goto(`/courses/${course!.id}/learners`);

  await page.getByRole("checkbox", { name: `Выбрать ученика ${directLearner.name}` }).check();
  await page.getByRole("checkbox", { name: `Выбрать ученика ${groupLearner.name}` }).check();
  await page.locator('#bulk-learner-access-form input[name="accessExpiresOn"]').fill(exactDateInput);
  await page.getByRole("button", { name: "Сохранить дату" }).first().click();

  await expect(page.getByText(`Срок доступа обновлен для 2 учеников до ${exactDateLabel}.`)).toBeVisible();

  const directLearnerRow = page.locator("table tbody tr").filter({ hasText: directLearner.name }).first();
  const groupLearnerRow = page.locator("table tbody tr").filter({ hasText: groupLearner.name }).first();
  await expect(directLearnerRow).toContainText(exactDateLabel);
  await expect(groupLearnerRow).toContainText(exactDateLabel);
  await expect(groupLearnerRow).not.toContainText("Без ограничения по сроку");

  await getPrisma().courseUserAssignment.update({
    where: {
      courseId_userId: {
        courseId: course!.id,
        userId: groupLearner.id,
      },
    },
    data: {
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  });

  const learnerContext = await browser.newContext();
  const learnerPage = await learnerContext.newPage();

  try {
    await login(learnerPage, { login: groupLearner.login, password: overridePassword });
    await expect(learnerPage.getByRole("heading", { name: "Мои курсы" })).toBeVisible();
    await expect(learnerPage.getByRole("link", { name: SEEDED_COURSE_TITLE })).toHaveCount(0);

    await learnerPage.goto(`/courses/${course!.id}`);
    await expect(learnerPage).toHaveURL(/\/courses$/);
  } finally {
    await closeContexts([learnerContext]);
  }
});

test("hr can bulk-manage access for all learners in the current filter", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: { id: true },
  });
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });

  expect(course?.id).toBeTruthy();
  expect(studentRoleProfile?.id).toBeTruthy();

  const exactDate = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);
  const exactDateInput = toDateInputValue(exactDate);
  const exactDateLabel = formatDateRu(exactDate);

  const [firstLearner, secondLearner] = await Promise.all([
    getPrisma().user.create({
      data: {
        name: `Фильтрованный Ученик A ${uniqueSuffix}`,
        login: `filtera${uniqueSuffix}`,
        email: `filtera${uniqueSuffix}@example.com`,
        passwordHash: "filter-a",
        role: "Ученик",
        status: "ACTIVE",
        userRoles: {
          create: {
            roleProfileId: studentRoleProfile!.id,
          },
        },
      },
      select: { id: true, name: true },
    }),
    getPrisma().user.create({
      data: {
        name: `Фильтрованный Ученик B ${uniqueSuffix}`,
        login: `filterb${uniqueSuffix}`,
        email: `filterb${uniqueSuffix}@example.com`,
        passwordHash: "filter-b",
        role: "Ученик",
        status: "ACTIVE",
        userRoles: {
          create: {
            roleProfileId: studentRoleProfile!.id,
          },
        },
      },
      select: { id: true, name: true },
    }),
  ]);

  await Promise.all([
    getPrisma().courseUserAssignment.create({
      data: {
        courseId: course!.id,
        userId: firstLearner.id,
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
    }),
    getPrisma().courseUserAssignment.create({
      data: {
        courseId: course!.id,
        userId: secondLearner.id,
        expiresAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  await login(page, HR);
  await page.goto(`/courses/${course!.id}/learners?q=${encodeURIComponent(uniqueSuffix)}`);

  await page.locator('select[name="bulkScope"]').selectOption("filtered");
  await page.locator('#bulk-learner-access-form input[name="accessExpiresOn"]').fill(exactDateInput);
  await page.getByRole("button", { name: "Сохранить дату" }).first().click();

  await expect(
    page.getByText(`Срок доступа обновлен для 2 учеников из текущего фильтра до ${exactDateLabel}.`)
  ).toBeVisible();

  const firstRow = page.locator("table tbody tr").filter({ hasText: firstLearner.name }).first();
  const secondRow = page.locator("table tbody tr").filter({ hasText: secondLearner.name }).first();
  await expect(firstRow).toContainText(exactDateLabel);
  await expect(secondRow).toContainText(exactDateLabel);
});

test("hr sees and can queue notifications about soon expiring access", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: { id: true },
  });
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });

  expect(course?.id).toBeTruthy();
  expect(studentRoleProfile?.id).toBeTruthy();

  const learner = await getPrisma().user.create({
    data: {
      name: `Истекающий Доступ ${uniqueSuffix}`,
      login: `expiresoon${uniqueSuffix}`,
      email: `expiresoon${uniqueSuffix}@example.com`,
      passwordHash: "expiring-soon",
      role: "Ученик",
      status: "ACTIVE",
      userRoles: {
        create: {
          roleProfileId: studentRoleProfile!.id,
        },
      },
    },
    select: { id: true, name: true, login: true },
  });

  await getPrisma().courseUserAssignment.create({
    data: {
      courseId: course!.id,
      userId: learner.id,
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    },
  });

  await login(page, HR);
  await page.goto("/admin/reports#hr-notifications");

  await expect(page.getByRole("heading", { name: "HR-уведомления" })).toBeVisible();
  await expect(page.getByText("Скоро истекает доступ").first()).toBeVisible();
  await page.locator('input[name="accessExpiringDays"]').fill("3");
  await page.getByRole("button", { name: "Сохранить настройки" }).click();

  await expect(page.getByText("Настройки уведомлений сохранены.")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`Скоро истекает доступ ${learner.name}`) })).toBeVisible();
  await expect(page.getByText("Скоро истекает доступ").first()).toBeVisible();

  await page.getByRole("button", { name: "Поставить email-уведомления в очередь" }).click();
  await expect(page.getByText(/Писем поставлено в очередь:/)).toBeVisible();

  const payload = await waitForHrNotificationEmailPayload("access_expiring", learner.login);
  expect(payload.learnerLogin).toBe(learner.login);
  expect(payload.courseTitle).toBe(SEEDED_COURSE_TITLE);
});

test("hr sees completion and low-activity notifications and can queue their emails", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const studentRoleProfile = await getPrisma().roleProfile.findUnique({
    where: { name: "Ученик" },
    select: { id: true },
  });

  expect(studentRoleProfile?.id).toBeTruthy();

  const course = await getPrisma().course.create({
    data: {
      title: `HR уведомления ${uniqueSuffix}`,
      description: "Минимальный курс для проверки HR-уведомлений",
      status: "PUBLISHED",
    },
    select: { id: true, title: true },
  });
  const pdfItem = await getPrisma().courseItem.create({
    data: {
      courseId: course.id,
      orderIndex: 1,
      type: "PDF",
      title: "Материал",
      content: "Обязательный материал",
      isRequired: true,
    },
    select: { id: true },
  });

  const completedLearner = await getPrisma().user.create({
    data: {
      name: `Завершил Курс ${uniqueSuffix}`,
      login: `hrdone${uniqueSuffix}`,
      email: `hrdone${uniqueSuffix}@example.com`,
      passwordHash: "hr-notification-completed",
      role: "Ученик",
      status: "ACTIVE",
      userRoles: {
        create: {
          roleProfileId: studentRoleProfile!.id,
        },
      },
    },
    select: { id: true, name: true, login: true },
  });

  const lowActivityLearner = await getPrisma().user.create({
    data: {
      name: `Низкая Активность ${uniqueSuffix}`,
      login: `hridle${uniqueSuffix}`,
      email: `hridle${uniqueSuffix}@example.com`,
      passwordHash: "hr-notification-low-activity",
      role: "Ученик",
      status: "ACTIVE",
      userRoles: {
        create: {
          roleProfileId: studentRoleProfile!.id,
        },
      },
    },
    select: { id: true, name: true, login: true },
  });

  await getPrisma().courseUserAssignment.create({
    data: {
      courseId: course.id,
      userId: completedLearner.id,
    },
  });

  await getPrisma().courseUserAssignment.create({
    data: {
      courseId: course.id,
      userId: lowActivityLearner.id,
      assignedById: null,
      assignedAt: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000),
    },
  });

  await getPrisma().courseItemView.create({
    data: {
      courseItemId: pdfItem.id,
      userId: completedLearner.id,
      progressPercent: 100,
      maxPageSeen: 8,
      totalPages: 8,
      viewedAt: new Date(),
    },
  });

  await login(page, HR);
  await page.goto("/admin/reports#hr-notifications");

  await expect(page.getByRole("heading", { name: "HR-уведомления" })).toBeVisible();
  await page.locator('input[name="notifyCourseCompleted"]').check();
  await page.locator('input[name="notifyLowActivity"]').check();
  await page.locator('input[name="lowActivityDays"]').fill("3");
  await page.getByRole("button", { name: "Сохранить настройки" }).click();

  await expect(page.getByText("Настройки уведомлений сохранены.")).toBeVisible();

  const completedLink = page.getByRole("link", {
    name: new RegExp(`${completedLearner.name} завершил курс`),
  });
  const lowActivityLink = page.getByRole("link", {
    name: new RegExp(`${lowActivityLearner.name} давно не заходил в курс`),
  });

  await expect(completedLink).toBeVisible();
  await expect(lowActivityLink).toBeVisible();
  await expect(completedLink).toHaveAttribute(
    "href",
    new RegExp(`/courses/${course.id}/learners\\?q=${encodeURIComponent(completedLearner.login)}`)
  );
  await expect(lowActivityLink).toHaveAttribute(
    "href",
    new RegExp(`/courses/${course.id}/learners\\?q=${encodeURIComponent(lowActivityLearner.login)}`)
  );
  await expect(page.getByText("Завершения:", { exact: false })).toBeVisible();
  await expect(page.getByText("Низкая активность:", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Поставить email-уведомления в очередь" }).click();
  await expect(page.getByText(/Писем поставлено в очередь:/)).toBeVisible();

  const completedPayload = await waitForHrNotificationEmailPayload("course_completed", completedLearner.login);
  expect(completedPayload.learnerLogin).toBe(completedLearner.login);
  expect(completedPayload.courseTitle).toBe(course.title);

  const lowActivityPayload = await waitForHrNotificationEmailPayload("low_activity", lowActivityLearner.login);
  expect(lowActivityPayload.learnerLogin).toBe(lowActivityLearner.login);
  expect(lowActivityPayload.courseTitle).toBe(course.title);
});

test("course invite keeps exact access date after registration", async ({ browser, page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const invitedEmail = `invite${uniqueSuffix}@example.com`;
  const invitedName = `Приглашенный Ученик ${uniqueSuffix}`;
  const invitedLogin = `invite${uniqueSuffix}`;
  const invitedPassword = "invite1234";
  const exactDate = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
  const exactDateInput = toDateInputValue(exactDate);
  const exactDateLabel = formatDateRu(exactDate);

  await login(page, HR);
  await page.goto(`/courses?q=${encodeURIComponent(SEEDED_COURSE_TITLE)}`);

  const courseRow = page.locator("table tbody tr").filter({ hasText: SEEDED_COURSE_TITLE }).first();
  await expect(courseRow).toBeVisible();
  await courseRow.getByRole("link", { name: "Ученики" }).click();

  await expect(page).toHaveURL(/\/courses\/[^/]+\/learners/);
  await page.getByRole("link", { name: "Назначения", exact: true }).click();
  await expect(page).toHaveURL(/\/courses\/[^/]+\/manage\?section=assignments/);

  const courseIdMatch = new URL(page.url()).pathname.match(/\/courses\/([^/]+)\/manage/);
  const courseId = courseIdMatch?.[1] ?? "";
  expect(courseId).not.toBe("");

  const recipientsDialog = await openAssignmentRecipientsDialog(page);
  await recipientsDialog.getByRole("button", { name: "Новые по email" }).click();
  await recipientsDialog.getByLabel("Email учеников").fill(invitedEmail);
  const accessPicker = await openAssignmentAccessPicker(recipientsDialog);
  await accessPicker.locator('input[name="accessExpiresOn"]').fill(exactDateInput);
  await recipientsDialog.getByRole("button", { name: "Назначить выбранных" }).click();

  await expect(page.getByText("Назначения сохранены")).toBeVisible();

  const invitePayload = await waitForCourseInvitePayload(invitedEmail);
  expect(invitePayload.inviteUrl).toContain("/invite/");
  if (!invitePayload.accessExpiresAt) {
    throw new Error("Invite payload is missing accessExpiresAt");
  }
  expect(invitePayload.accessExpiresAt).toContain(exactDateInput);

  const inviteContext = await browser.newContext();
  const invitePage = await inviteContext.newPage();

  try {
    await invitePage.goto(invitePayload.inviteUrl);
    await expect(invitePage.getByText(`Доступ к курсу будет открыт до ${exactDateLabel}.`)).toBeVisible();
    await invitePage.getByLabel("Имя и фамилия").fill(invitedName);
    await invitePage.getByLabel("Логин").fill(invitedLogin);
    await invitePage.getByLabel("Пароль").fill(invitedPassword);

    await Promise.all([
      invitePage.waitForURL(new RegExp(`/courses/${courseId}`)),
      invitePage.getByRole("button", { name: "Зарегистрироваться и открыть курс" }).click(),
    ]);
    await expect(invitePage.getByRole("heading", { name: SEEDED_COURSE_TITLE })).toBeVisible();
  } finally {
    await inviteContext.close();
  }

  const assignment = await waitForCourseAssignment(courseId, invitedEmail);
  expect(assignment.expiresAt).not.toBeNull();
  expect(toDateInputValue(assignment.expiresAt!)).toBe(exactDateInput);
});

test("blocked learner loses an already active session on the next request", async ({ browser }) => {
  const studentContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const adminPage = await adminContext.newPage();

  try {
    await resetSeededStudentAccount();
    await login(studentPage, STUDENT);
    await expect(studentPage).toHaveURL(/\/courses/);
    await expect(studentPage.getByRole("heading", { name: "Мои курсы" })).toBeVisible();

    await login(adminPage, ADMIN);
    await adminPage.goto("/admin/users-groups?tab=users");
    await adminPage.locator('input[name="q"]').fill(STUDENT.login);
    await adminPage.getByRole("button", { name: "Применить" }).click();

    const learnerButton = adminPage.getByRole("button", { name: SEEDED_STUDENT_NAME });
    await expect(learnerButton).toBeVisible();
    await learnerButton.click();

    await expect(adminPage).toHaveURL(/\/admin\/users\/[^/]+\/edit$/);
    await adminPage.locator('select[name="status"]').selectOption("BLOCKED");
    await adminPage.getByRole("button", { name: "Сохранить изменения" }).click();

    await expect(adminPage).toHaveURL(/\/admin\/users-groups\?tab=users/);

    await studentPage.goto("/courses");
    await expect(studentPage).toHaveURL(/\/login/);
    await expect(studentPage.getByRole("heading", { name: "Вход в систему" })).toBeVisible();
  } finally {
    await resetSeededStudentAccount();
    await closeContexts([studentContext, adminContext]);
  }
});

test("hr can block a learner from the learner page, move them to archive, and revoke the active session", async ({
  browser,
}) => {
  const studentContext = await browser.newContext();
  const hrContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const hrPage = await hrContext.newPage();

  try {
    await resetSeededStudentAccount();
    await login(studentPage, STUDENT);
    await expect(studentPage).toHaveURL(/\/courses/);

    await login(hrPage, HR);
    await hrPage.goto(`/courses?q=${encodeURIComponent(SEEDED_COURSE_TITLE)}`);

    const courseRow = hrPage.locator("table tbody tr").filter({ hasText: SEEDED_COURSE_TITLE }).first();
    await expect(courseRow).toBeVisible();
    await courseRow.getByRole("link", { name: "Ученики" }).click();

    await expect(hrPage).toHaveURL(/\/courses\/[^/]+\/learners/);
    const courseIdMatch = new URL(hrPage.url()).pathname.match(/\/courses\/([^/]+)\/learners/);
    const courseId = courseIdMatch?.[1] ?? "";
    expect(courseId).not.toBe("");

    await hrPage.getByRole("link", { name: SEEDED_STUDENT_NAME }).click();
    await expect(hrPage.getByRole("button", { name: "Заблокировать ученика" })).toBeVisible();
    await hrPage.getByRole("button", { name: "Заблокировать ученика" }).click();

    await expect(hrPage).toHaveURL(/\/admin\/reports\/learner-progress\?/);
    await expect(hrPage).toHaveURL(/userStatus=blocked/);
    await expect(hrPage).toHaveURL(/q=finansist2/);
    await expect(hrPage.getByText("заблокирован и перемещен в архив HR")).toBeVisible();

    const blockedRow = hrPage.locator("table tbody tr").filter({ hasText: SEEDED_STUDENT_NAME }).first();
    await expect(blockedRow).toBeVisible();
    await expect(blockedRow.getByRole("link", { name: SEEDED_STUDENT_NAME })).toBeVisible();

    await hrPage.goto(`/admin/reports/learner-progress?q=${STUDENT.login}`);
    await expect(hrPage.locator("table tbody tr").filter({ hasText: SEEDED_STUDENT_NAME })).toHaveCount(0);

    await hrPage.goto(`/courses/${courseId}/learners?q=${STUDENT.login}`);
    await expect(hrPage.locator("table tbody tr").filter({ hasText: SEEDED_STUDENT_NAME })).toHaveCount(0);

    await studentPage.goto("/courses");
    await expect(studentPage).toHaveURL(/\/login/);
    await expect(studentPage.getByRole("heading", { name: "Вход в систему" })).toBeVisible();
  } finally {
    await resetSeededStudentAccount();
    await closeContexts([studentContext, hrContext]);
  }
});

test("admin can save general platform settings and see them on login page", async ({ page }) => {
  const siteName = `Team LMS ${Date.now().toString().slice(-6)}`;
  const siteDescription = "Портал обучения для финансового департамента";
  const supportEmail = "support@team-lms.test";
  const previewDateTime = "04/22/2026 03:45 PM";
  const previewSection = page.locator("aside").filter({
    has: page.getByRole("heading", { name: "Предпросмотр" }),
  });

  await login(page, ADMIN);
  await page.goto("/admin/settings?tab=general");

  await expect(page.getByRole("heading", { name: "Настройки платформы" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Настройки - Общие" })).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles("public/next.svg");
  await expect(page.locator('input[name="logoUrl"]')).toHaveValue(/\/branding\//);
  await page.locator('input[type="file"]').nth(1).setInputFiles("public/next.svg");
  await expect(page.locator('input[name="faviconUrl"]')).toHaveValue(/\/branding\//);

  await page.getByLabel("Название сайта").fill(siteName);
  await page.getByLabel("Короткое описание").fill(siteDescription);
  await page.getByLabel("Email поддержки").fill(supportEmail);
  await page.getByLabel("Часовой пояс").selectOption("UTC");
  await page.getByLabel("Формат даты").selectOption("MM/DD/YYYY");
  await page.getByLabel("Формат времени").selectOption("12H");

  await expect(previewSection.getByText(siteName, { exact: true })).toBeVisible();
  await expect(previewSection.getByText(siteDescription, { exact: true })).toBeVisible();
  await expect(previewSection.getByText(`Поддержка: ${supportEmail}`)).toBeVisible();
  await expect(previewSection.getByText(previewDateTime)).toBeVisible();

  await page.getByRole("button", { name: "Сохранить общие настройки" }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText("Введите текущий пароль администратора для подтверждения.");
  await expect(page.getByLabel("Название сайта")).toHaveValue(siteName);
  await expect(page.getByLabel("Короткое описание")).toHaveValue(siteDescription);
  await expect(page.getByLabel("Email поддержки")).toHaveValue(supportEmail);
  await expect(page.getByLabel("Часовой пояс")).toHaveValue("UTC");
  await expect(page.getByLabel("Формат даты")).toHaveValue("MM/DD/YYYY");
  await expect(page.getByLabel("Формат времени")).toHaveValue("12H");
  await expect(page.locator('input[name="logoUrl"]')).toHaveValue(/\/branding\//);
  await expect(page.locator('input[name="faviconUrl"]')).toHaveValue(/\/branding\//);

  await page.getByLabel("Подтвердите текущим паролем").fill(ADMIN.password);
  await page.getByRole("button", { name: "Сохранить общие настройки" }).click();

  await expect(page.getByText("Общие настройки платформы сохранены.")).toBeVisible();

  const settings = await getPrisma().platformSettings.findUnique({
    where: { id: "default" },
    select: {
      siteName: true,
      siteDescription: true,
      supportEmail: true,
      logoUrl: true,
      faviconUrl: true,
      timeZone: true,
      dateFormat: true,
      timeFormat: true,
    },
  });

  expect(settings?.siteName).toBe(siteName);
  expect(settings?.siteDescription).toBe(siteDescription);
  expect(settings?.supportEmail).toBe(supportEmail);
  expect(settings?.logoUrl).toMatch(/^\/branding\//);
  expect(settings?.faviconUrl).toMatch(/^\/branding\//);
  expect(settings?.timeZone).toBe("UTC");
  expect(settings?.dateFormat).toBe("MM/DD/YYYY");
  expect(settings?.timeFormat).toBe("12H");

  await logoutToLogin(page);

  await expect(page.getByText(siteName)).toBeVisible();
  await expect(page.getByText(siteDescription)).toBeVisible();
  await expect(page.getByText(supportEmail)).toBeVisible();
});

test("student can leave a 5-star course review that waits for moderation and gets published by admin", async ({ page }) => {
  await resetSeededStudentAccount();

  const studentUser = await getPrisma().user.findUnique({
    where: { login: STUDENT.login },
    select: { id: true, name: true },
  });
  const course = await getPrisma().course.findFirst({
    where: { title: SEEDED_COURSE_TITLE },
    select: { id: true, title: true },
  });

  expect(studentUser?.id).toBeTruthy();
  expect(course?.id).toBeTruthy();

  await getPrisma().courseUserAssignment.upsert({
    where: {
      courseId_userId: {
        courseId: course!.id,
        userId: studentUser!.id,
      },
    },
    create: {
      courseId: course!.id,
      userId: studentUser!.id,
    },
    update: {
      assignedAt: new Date(),
      expiresAt: null,
    },
  });
  await seedLearnerCourseProgress(course!.id, studentUser!.id);
  await getPrisma().courseFeedback.deleteMany({
    where: {
      courseId: course!.id,
      userId: studentUser!.id,
    },
  });

  await login(page, ADMIN);
  await page.goto("/admin/settings?tab=general");
  await page.getByLabel("Модерировать отзывы перед публикацией").check();
  await page.getByLabel("Подтвердите текущим паролем").fill(ADMIN.password);
  await page.getByRole("button", { name: "Сохранить общие настройки" }).click();

  await expect(page.getByText("Общие настройки платформы сохранены.")).toBeVisible();

  await logoutToLogin(page);

  await login(page, STUDENT);
  await page.goto(`/courses/${course!.id}`);

  await expect(page.getByText("Все обязательные этапы пройдены")).toBeVisible();
  await page.getByRole("link", { name: "Оценить курс" }).click();

  await expect(page).toHaveURL(new RegExp(`/courses/${course!.id}/feedback$`));
  await expect(page.getByText("Как вы оцениваете этот курс?")).toBeVisible();
  await page.getByRole("button", { name: "4 звезды - Хорошо" }).click();
  await page.getByLabel("Комментарий").fill("Полезный курс, особенно блок с разбором практики.");
  await page.getByRole("button", { name: "Отправить отзыв" }).click();

  await expect(page).toHaveURL(new RegExp(`/courses/${course!.id}/feedback\\?feedback=pending`));
  await expect(page.getByText("Отзыв сохранен и отправлен на модерацию.")).toBeVisible();

  const feedback = await getPrisma().courseFeedback.findUnique({
    where: {
      courseId_userId: {
        courseId: course!.id,
        userId: studentUser!.id,
      },
    },
    select: {
      id: true,
      rating: true,
      status: true,
      comment: true,
    },
  });

  expect(feedback?.rating).toBe(4);
  expect(feedback?.status).toBe("PENDING");
  expect(feedback?.comment).toContain("Полезный курс");

  await logoutToLogin(page);

  await login(page, ADMIN);
  await page.goto(`/courses/${course!.id}/manage?section=feedback`);

  const feedbackCard = page.locator("li").filter({ hasText: studentUser!.name ?? STUDENT.login }).first();
  await expect(feedbackCard).toContainText("Оценка: 4/5");
  await expect(feedbackCard).toContainText("На модерации");
  await feedbackCard.getByRole("button", { name: "Опубликовать" }).click();

  await expect(page.getByText("Отзыв опубликован.")).toBeVisible();
  await expect(feedbackCard).toContainText("Опубликован");
  await expect(feedbackCard.getByRole("button", { name: "Опубликовать" })).toHaveCount(0);

  const publishedFeedback = await getPrisma().courseFeedback.findUnique({
    where: { id: feedback!.id },
    select: { status: true },
  });
  expect(publishedFeedback?.status).toBe("PUBLISHED");
});

test("student returns to a completed no-quiz course card and can rate it", async ({ page }) => {
  await resetSeededStudentAccount();

  const uniqueSuffix = Date.now().toString().slice(-6);
  const studentUser = await getPrisma().user.findUnique({
    where: { login: STUDENT.login },
    select: { id: true },
  });

  expect(studentUser?.id).toBeTruthy();

  await getPrisma().platformSettings.upsert({
    where: { id: "default" },
    create: { id: "default", feedbackEnabled: true },
    update: { feedbackEnabled: true },
  });

  const course = await getPrisma().course.create({
    data: {
      title: `Курс без теста ${uniqueSuffix}`,
      description: "Проверяем завершение курса после последнего материала.",
      status: "PUBLISHED",
      publishedAt: new Date(),
      items: {
        create: {
          title: `Последний урок ${uniqueSuffix}`,
          type: "TEXT",
          content: "Финальный материал без итогового теста.",
          orderIndex: 0,
          isRequired: true,
        },
      },
      directAssignments: {
        create: {
          userId: studentUser!.id,
        },
      },
    },
    select: { id: true },
  });

  await login(page, STUDENT);
  await page.goto(`/courses/${course.id}`);

  await expect(page.getByRole("heading", { name: `Курс без теста ${uniqueSuffix}` })).toBeVisible();
  await page.getByRole("link", { name: "Начать" }).first().click();
  await expect(page.getByText("Финальный материал без итогового теста.")).toBeVisible();

  await page.getByRole("button", { name: "Ознакомлен" }).click();

  await expect(page).toHaveURL(new RegExp(`/courses/${course.id}$`));
  await expect(page.getByText("Все обязательные этапы пройдены")).toBeVisible();
  await expect(page.getByRole("link", { name: "Оценить курс" })).toBeVisible();
});

test("student sees completion actions after passing the final quiz", async ({ page }) => {
  await resetSeededStudentAccount();

  const uniqueSuffix = Date.now().toString().slice(-6);
  const studentUser = await getPrisma().user.findUnique({
    where: { login: STUDENT.login },
    select: { id: true },
  });

  expect(studentUser?.id).toBeTruthy();

  await getPrisma().platformSettings.upsert({
    where: { id: "default" },
    create: { id: "default", feedbackEnabled: true },
    update: { feedbackEnabled: true },
  });

  const course = await getPrisma().course.create({
    data: {
      title: `Курс с финальным тестом ${uniqueSuffix}`,
      description: "Проверяем следующий шаг после результата теста.",
      status: "PUBLISHED",
      publishedAt: new Date(),
      directAssignments: {
        create: {
          userId: studentUser!.id,
        },
      },
    },
    select: { id: true, title: true },
  });
  const quizItem = await getPrisma().courseItem.create({
    data: {
      courseId: course.id,
      title: `Итоговый тест ${uniqueSuffix}`,
      type: "QUIZ",
      orderIndex: 0,
      isRequired: true,
    },
    select: { id: true, title: true },
  });
  const quiz = await getPrisma().quiz.create({
    data: {
      courseItemId: quizItem.id,
      maxAttempts: 2,
      minCorrectAnswers: 1,
      questions: {
        create: {
          orderIndex: 0,
          type: "SINGLE_CHOICE",
          prompt: "Выберите правильный ответ",
          config: JSON.stringify({
            options: ["Правильно", "Неверно"],
            correctIndex: 0,
          }),
          points: 1,
        },
      },
    },
    select: { id: true },
  });

  await login(page, STUDENT);
  await page.goto(`/courses/${course.id}/quiz/${quiz.id}`);

  await expect(page.getByRole("heading", { name: quizItem.title })).toBeVisible();
  await page.locator('input[type="radio"][value="0"]').check();
  await Promise.all([
    page.waitForURL(new RegExp(`/courses/${course.id}/quiz/${quiz.id}/result\\?attempt=`)),
    page.getByRole("button", { name: "Закончить тест" }).click(),
  ]);

  const completionCard = page.locator("section").filter({ hasText: "Поздравляем, вы прошли тест!" });
  await expect(completionCard).toBeVisible();
  await expect(completionCard.getByText("Все обязательные этапы пройдены. Выберите следующий шаг.")).toBeVisible();
  await expect(completionCard.getByRole("link", { name: "Оценить курс" })).toBeVisible();
  await expect(completionCard.getByRole("link", { name: "К карточке курса" })).toBeVisible();
  await expect(completionCard.getByRole("link", { name: "Мои курсы" })).toBeVisible();
  await expect(completionCard.getByRole("link", { name: "Пройти заново" })).toHaveCount(0);
  await expect(completionCard.getByText("Курс завершен")).toHaveCount(0);
  await expect(completionCard.getByText(quizItem.title)).toHaveCount(0);
  await expect(completionCard.getByText("Режим показа")).toHaveCount(0);

  await page.goto(`/courses/${course.id}/quiz/${quiz.id}`);
  await expect(page).toHaveURL(new RegExp(`/courses/${course.id}/quiz/${quiz.id}/result\\?attempt=`));
  await expect(page.locator("section").filter({ hasText: "Поздравляем, вы прошли тест!" })).toBeVisible();
  await expect(page.getByText("Новая попытка недоступна")).toHaveCount(0);
});

test("student can retry a failed quiz while attempts remain", async ({ page }) => {
  await resetSeededStudentAccount();

  const uniqueSuffix = Date.now().toString().slice(-6);
  const studentUser = await getPrisma().user.findUnique({
    where: { login: STUDENT.login },
    select: { id: true },
  });

  expect(studentUser?.id).toBeTruthy();

  const course = await getPrisma().course.create({
    data: {
      title: `Курс с повтором теста ${uniqueSuffix}`,
      description: "Проверяем повторную попытку после провала.",
      status: "PUBLISHED",
      publishedAt: new Date(),
      directAssignments: {
        create: {
          userId: studentUser!.id,
        },
      },
    },
    select: { id: true, title: true },
  });
  const quizItem = await getPrisma().courseItem.create({
    data: {
      courseId: course.id,
      title: `Тест с повтором ${uniqueSuffix}`,
      type: "QUIZ",
      orderIndex: 0,
      isRequired: true,
    },
    select: { id: true, title: true },
  });
  const quiz = await getPrisma().quiz.create({
    data: {
      courseItemId: quizItem.id,
      maxAttempts: 2,
      minCorrectAnswers: 1,
      questions: {
        create: {
          orderIndex: 0,
          type: "SINGLE_CHOICE",
          prompt: "Выберите правильный ответ",
          config: JSON.stringify({
            options: ["Правильно", "Неверно"],
            correctIndex: 0,
          }),
          points: 1,
        },
      },
    },
    select: { id: true },
  });

  await login(page, STUDENT);
  await page.goto(`/courses/${course.id}/quiz/${quiz.id}`);

  await expect(page.getByRole("heading", { name: quizItem.title })).toBeVisible();
  await page.locator('input[type="radio"][value="1"]').check();
  await Promise.all([
    page.waitForURL(new RegExp(`/courses/${course.id}/quiz/${quiz.id}/result\\?attempt=`)),
    page.getByRole("button", { name: "Закончить тест" }).click(),
  ]);

  const resultCard = page.locator("section").filter({ hasText: "Вы не прошли тест" });
  await expect(resultCard).toBeVisible();
  await expect(resultCard.getByRole("link", { name: "Пройти заново" })).toBeVisible();
  await expect(resultCard.getByRole("link", { name: "Оценить курс" })).toHaveCount(0);
});

test("student cannot open course materials after starting a required quiz", async ({ page }) => {
  await resetSeededStudentAccount();

  const uniqueSuffix = Date.now().toString().slice(-6);
  const studentUser = await getPrisma().user.findUnique({
    where: { login: STUDENT.login },
    select: { id: true },
  });

  expect(studentUser?.id).toBeTruthy();

  const course = await getPrisma().course.create({
    data: {
      title: `Блокировка материалов ${uniqueSuffix}`,
      description: "После старта обязательного теста материалы должны блокироваться.",
      status: "PUBLISHED",
      publishedAt: new Date(),
      directAssignments: {
        create: {
          userId: studentUser!.id,
        },
      },
    },
    select: { id: true, title: true },
  });

  const materialItem = await getPrisma().courseItem.create({
    data: {
      courseId: course.id,
      title: `Материал перед тестом ${uniqueSuffix}`,
      type: "TEXT",
      content: "Содержимое обязательного материала перед тестом.",
      orderIndex: 0,
      isRequired: true,
    },
    select: { id: true, title: true },
  });

  const quizItem = await getPrisma().courseItem.create({
    data: {
      courseId: course.id,
      title: `Тест блокировки ${uniqueSuffix}`,
      type: "QUIZ",
      orderIndex: 1,
      isRequired: true,
    },
    select: { id: true, title: true },
  });

  const quiz = await getPrisma().quiz.create({
    data: {
      courseItemId: quizItem.id,
      maxAttempts: 2,
      minCorrectAnswers: 1,
      questions: {
        create: {
          orderIndex: 0,
          type: "SINGLE_CHOICE",
          prompt: "Выберите правильный ответ",
          config: JSON.stringify({
            options: ["Правильно", "Неверно"],
            correctIndex: 0,
          }),
          points: 1,
        },
      },
    },
    select: { id: true },
  });

  await login(page, STUDENT);
  await page.goto(`/courses/${course.id}`);

  await expect(page.getByRole("heading", { name: course.title })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(materialItem.title) }).click();
  await expect(page.getByText("Содержимое обязательного материала перед тестом.")).toBeVisible();
  await page.getByRole("button", { name: "Ознакомлен" }).click();
  await page.reload();

  await page.goto(`/courses/${course.id}/quiz/${quiz.id}`);
  await expect(page.getByRole("heading", { name: quizItem.title })).toBeVisible();
  await page.locator('input[type="radio"][value="0"]').check();

  await expect
    .poll(async () => {
      const attempt = await getPrisma().quizAttempt.findFirst({
        where: {
          quizId: quiz.id,
          userId: studentUser!.id,
        },
        orderBy: { attemptNumber: "desc" },
        select: { outcome: true },
      });
      return attempt?.outcome ?? null;
    })
    .toBe("IN_PROGRESS");

  await page.goto(`/courses/${course.id}`);

  const materialRow = page.locator("li").filter({ hasText: materialItem.title }).first();
  await expect(materialRow).toContainText("Заблокирован");
  await expect(page.getByRole("link", { name: new RegExp(materialItem.title) })).toHaveCount(0);

  await page.goto(`/courses/${course.id}?item=${materialItem.id}`);
  await expect(
    page.getByText("Просмотр материалов заблокирован, пока вы не завершите начатый тест.")
  ).toBeVisible();
  await expect(page.getByText("Содержимое обязательного материала перед тестом.")).toHaveCount(0);
});

test("admin can save smtp settings from the email settings tab", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const smtpHost = `smtp-${suffix}.example.com`;
  const smtpLogin = `mailer-${suffix}`;
  const smtpFromEmail = `noreply-${suffix}@example.com`;
  const smtpFromName = `Notifier ${suffix}`;

  await login(page, ADMIN);
  await page.goto("/admin/settings?tab=email");

  await expect(page.getByRole("heading", { name: "Настройки - Email" })).toBeVisible();

  await page.getByLabel("SMTP-хост").fill(smtpHost);
  await page.getByLabel("Порт").fill("465");
  await page.getByLabel("Шифрование").selectOption("SSL");
  await page.getByLabel("Логин").fill(smtpLogin);
  await page.getByLabel("Пароль").fill("smtp-secret-123");
  await page.getByLabel("Email отправителя").fill(smtpFromEmail);
  await page.getByLabel("Имя отправителя").fill(smtpFromName);
  await page.getByRole("button", { name: "Сохранить email-настройки" }).click();

  await expect(page.getByText("Email-настройки сохранены.")).toBeVisible();

  const settings = await getPrisma().platformSettings.findUnique({
    where: { id: "default" },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpEncryption: true,
      smtpLogin: true,
      smtpPassword: true,
      smtpFromEmail: true,
      smtpFromName: true,
    },
  });

  expect(settings?.smtpHost).toBe(smtpHost);
  expect(settings?.smtpPort).toBe(465);
  expect(settings?.smtpEncryption).toBe("SSL");
  expect(settings?.smtpLogin).toBe(smtpLogin);
  expect(settings?.smtpPassword).toBe("smtp-secret-123");
  expect(settings?.smtpFromEmail).toBe(smtpFromEmail);
  expect(settings?.smtpFromName).toBe(smtpFromName);
});

test("admin can validate smtp connection settings before saving", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/admin/settings?tab=email");

  await page.getByLabel("Порт").fill("0");
  await page.getByRole("button", { name: "Проверить подключение" }).click();

  await expect(page.getByText("SMTP-порт должен быть числом от 1 до 65535.")).toBeVisible();
});

test("admin can customize email templates and queued emails use them", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const welcomeSubject = `Добро пожаловать ${suffix}`;
  const welcomeHeading = `Доступ к платформе открыт ${suffix}`;
  const welcomeBody = `Это письмо подтверждает подключение к LMS ${suffix}.`;
  const welcomeFooter = `По вопросам подключения ${suffix} обратитесь в поддержку.`;
  const passwordResetSubject = `Новый пароль ${suffix}`;
  const passwordResetHeading = `Для аккаунта создан временный пароль ${suffix}`;
  const passwordResetBody = `Используйте временный пароль из письма и затем смените его.`;
  const passwordResetFooter = `Если сброс не запрашивали, сообщите администратору ${suffix}.`;
  const userName = `Email Template ${suffix}`;
  const userLogin = `emailtpl${suffix}`;
  const userEmail = `emailtpl${suffix}@example.com`;

  await login(page, ADMIN);
  await page.goto("/admin/settings?tab=email");

  await fillManagedEmailTemplate(page, "Приветственное письмо", {
    subject: welcomeSubject,
    heading: welcomeHeading,
    body: welcomeBody,
    footer: welcomeFooter,
  });
  await fillManagedEmailTemplate(page, "Сброс пароля", {
    subject: passwordResetSubject,
    heading: passwordResetHeading,
    body: passwordResetBody,
    footer: passwordResetFooter,
  });
  await expect(page.getByText("Сертификат", { exact: true })).toBeVisible();
  await expect(page.getByText("Пока не используется")).toBeVisible();
  await page.getByRole("button", { name: "Сохранить email-настройки" }).click();

  await expect(page.getByText("Email-настройки сохранены.")).toBeVisible();

  const settings = await getPrisma().platformSettings.findUnique({
    where: { id: "default" },
    select: {
      welcomeEmailTemplateJson: true,
      passwordResetEmailTemplateJson: true,
    },
  });

  const welcomeTemplate = JSON.parse(settings?.welcomeEmailTemplateJson ?? "{}") as {
    subject?: string;
    heading?: string;
    body?: string;
    footer?: string;
  };
  const passwordResetTemplate = JSON.parse(settings?.passwordResetEmailTemplateJson ?? "{}") as {
    subject?: string;
    heading?: string;
    body?: string;
    footer?: string;
  };

  expect(welcomeTemplate.subject).toBe(welcomeSubject);
  expect(welcomeTemplate.heading).toBe(welcomeHeading);
  expect(welcomeTemplate.body).toBe(welcomeBody);
  expect(welcomeTemplate.footer).toBe(welcomeFooter);
  expect(passwordResetTemplate.subject).toBe(passwordResetSubject);
  expect(passwordResetTemplate.heading).toBe(passwordResetHeading);
  expect(passwordResetTemplate.body).toBe(passwordResetBody);
  expect(passwordResetTemplate.footer).toBe(passwordResetFooter);

  await page.goto("/admin/users/new");
  await page.getByLabel("Имя пользователя").fill(userName);
  await page.getByLabel("Логин").fill(userLogin);
  await page.getByLabel("Email").fill(userEmail);
  await page.getByRole("button", { name: "Создать и отправить приглашение" }).click();

  await expect(page.getByText("Пользователь создан. Письмо со ссылкой для активации поставлено в очередь.")).toBeVisible();

  const activationEmailJob = await waitForUserActivationEmailJob(userEmail);
  expect(activationEmailJob.subject).toBe(welcomeSubject);
  expect(activationEmailJob.textBody).toContain(welcomeHeading);
  expect(activationEmailJob.textBody).toContain(welcomeBody);
  expect(activationEmailJob.textBody).toContain(welcomeFooter);
  expect(activationEmailJob.htmlBody).toContain("Активировать аккаунт");

  await page.goto(`/admin/users-groups?tab=users&q=${encodeURIComponent(userLogin)}`);
  await page.getByRole("button", { name: userName }).click();
  await page.getByRole("button", { name: "Сбросить пароль и отправить временный пароль" }).click();

  await expect(page.getByText("Временный пароль сохранен и поставлен в очередь на отправку.")).toBeVisible();

  const passwordResetEmailJob = await waitForUserAccessEmailJob(userEmail, "PASSWORD_RESET");
  expect(passwordResetEmailJob.subject).toBe(passwordResetSubject);
  expect(passwordResetEmailJob.textBody).toContain(passwordResetHeading);
  expect(passwordResetEmailJob.textBody).toContain(passwordResetBody);
  expect(passwordResetEmailJob.textBody).toContain(passwordResetFooter);
  expect(passwordResetEmailJob.htmlBody).toContain("Временный пароль");
});

test("maintenance mode limits access to admins and shows the configured message", async ({ browser, page }) => {
  const maintenanceMessage = `Платформа обновляется, вернемся после миграции ${Date.now().toString().slice(-6)}.`;
  const guestContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  const studentPage = await studentContext.newPage();

  try {
    await login(page, ADMIN);
    await page.goto("/admin/settings?tab=security");

    await page.getByLabel("Включить режим обслуживания").check();
    await page.getByLabel("Сообщение для пользователей").fill(maintenanceMessage);
    await page.getByRole("button", { name: "Сохранить режим обслуживания" }).click();

    await expect(page.getByText("Режим обслуживания обновлен.")).toBeVisible();

    const settings = await getPrisma().platformSettings.findUnique({
      where: { id: "default" },
      select: {
        maintenanceMode: true,
        maintenanceMessage: true,
      },
    });

    expect(settings?.maintenanceMode).toBe(true);
    expect(settings?.maintenanceMessage).toBe(maintenanceMessage);

    await guestPage.goto("/courses");
    await expect(guestPage).toHaveURL(/\/maintenance$/);
    await expect(guestPage.getByRole("heading", { name: "Платформа временно недоступна" })).toBeVisible();
    await expect(guestPage.getByText(maintenanceMessage)).toBeVisible();

    await guestPage.goto("/activate/test-token");
    await expect(guestPage).toHaveURL(/\/maintenance$/);

    await studentPage.goto("/login");
    await expect(
      studentPage.getByText("Режим обслуживания включен. Вход доступен только администраторам.")
    ).toBeVisible();
    await studentPage.getByLabel("Логин").fill(STUDENT.login);
    await studentPage.getByLabel("Пароль").fill(STUDENT.password);
    await studentPage.getByRole("button", { name: "Войти" }).click();
    await expect(studentPage.locator("form p[role='alert']")).toHaveText(
      "Платформа на техническом обслуживании. Вход временно доступен только администраторам."
    );

    await page.goto("/courses");
    await expect(page.getByRole("heading", { name: "Курсы", exact: true })).toBeVisible();
  } finally {
    await getPrisma().platformSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        maintenanceMode: false,
        maintenanceMessage: null,
      },
      update: {
        maintenanceMode: false,
        maintenanceMessage: null,
      },
    });

    await closeContexts([guestContext, studentContext]);
  }
});

test("admin can save security settings from the security settings tab", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/admin/settings?tab=security");

  await expect(page.getByRole("heading", { name: "Настройки - Безопасность" })).toBeVisible();

  await page.getByLabel("Минимальная длина пароля").fill("10");
  await page.getByLabel("Время жизни сессии, минуты").fill("180");
  await page.getByLabel("Лимит неудачных попыток входа").fill("4");
  await page.getByLabel("Блокировка после лимита, минуты").fill("20");
  await page.getByLabel("Срок хранения логов входа, дни").fill("120");
  await page.getByLabel("Срок хранения аудит-лога, дни").fill("365");
  await page.getByLabel("Требовать Google Authenticator для всех администраторов.").check();
  await page.getByLabel("Требовать хотя бы одну цифру").check();
  await page.getByLabel("Требовать хотя бы одну заглавную букву").check();
  await page.getByLabel("Требовать хотя бы один спецсимвол").check();
  await page.getByRole("button", { name: "Сохранить политики безопасности" }).click();

  await expect(page.getByText("Политики безопасности сохранены.")).toBeVisible();
  await expect(page.getByLabel("Минимальная длина пароля")).toHaveValue("10");
  await expect(page.getByLabel("Время жизни сессии, минуты")).toHaveValue("180");
  await expect(page.getByLabel("Лимит неудачных попыток входа")).toHaveValue("4");
  await expect(page.getByLabel("Блокировка после лимита, минуты")).toHaveValue("20");
  await expect(page.getByLabel("Срок хранения логов входа, дни")).toHaveValue("120");
  await expect(page.getByLabel("Срок хранения аудит-лога, дни")).toHaveValue("365");

  const settings = await getPrisma().platformSettings.findUnique({
    where: { id: "default" },
    select: {
      passwordMinLength: true,
      passwordRequireNumber: true,
      passwordRequireUppercase: true,
      passwordRequireSpecialChar: true,
      sessionMaxAgeMinutes: true,
      maxFailedLoginAttempts: true,
      loginLockoutMinutes: true,
      loginEventRetentionDays: true,
      auditLogRetentionDays: true,
      adminTotpRequired: true,
    },
  });

  expect(settings?.passwordMinLength).toBe(10);
  expect(settings?.passwordRequireNumber).toBe(true);
  expect(settings?.passwordRequireUppercase).toBe(true);
  expect(settings?.passwordRequireSpecialChar).toBe(true);
  expect(settings?.sessionMaxAgeMinutes).toBe(180);
  expect(settings?.maxFailedLoginAttempts).toBe(4);
  expect(settings?.loginLockoutMinutes).toBe(20);
  expect(settings?.loginEventRetentionDays).toBe(120);
  expect(settings?.auditLogRetentionDays).toBe(365);
  expect(settings?.adminTotpRequired).toBe(true);
});

test("admin is forced to set up 2FA and can sign in with TOTP or a recovery code", async ({ page }) => {
  const adminUser = await getPrisma().user.findUnique({
    where: { login: ADMIN.login },
    select: { id: true },
  });

  expect(adminUser?.id).toBeTruthy();

  await getPrisma().userTotpCredential.deleteMany({
    where: { userId: adminUser!.id },
  });

  await getPrisma().platformSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      adminTotpRequired: true,
    },
    update: {
      adminTotpRequired: true,
    },
  });

  await page.goto("/login");
  await page.getByLabel("Логин").fill(ADMIN.login);
  await page.getByLabel("Пароль").fill(ADMIN.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/auth\/2fa\/setup/);

  const secret = await page.getByLabel("Ключ для ручного ввода").inputValue();
  const setupCode = generateTotpCode(secret);

  await page.getByLabel("Код из Google Authenticator").fill(setupCode);
  await page.getByRole("button", { name: "Подключить Google Authenticator" }).click();

  await expect(page.getByText("2FA подключена")).toBeVisible();

  const firstRecoveryCode = (await page.locator("div.font-mono").first().textContent())?.trim() ?? "";
  expect(firstRecoveryCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  await Promise.all([
    page.waitForURL(/\/login/),
    page.getByRole("button", { name: "Я сохранил recovery-коды, войти заново" }).click(),
  ]);

  await expect(page.getByText("2FA подключена. Теперь войдите с кодом приложения.")).toBeVisible();

  await page.getByLabel("Логин").fill(ADMIN.login);
  await page.getByLabel("Пароль").fill(ADMIN.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.locator("form p[role='alert']")).toHaveText(
    "Введите код из Google Authenticator или recovery-код."
  );
  await expect(page.getByLabel("Код 2FA или recovery-код")).toBeVisible();

  await page.getByLabel("Код 2FA или recovery-код").fill(generateTotpCode(secret));
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("История входов")).toBeVisible();

  await logoutToLogin(page);

  await page.getByLabel("Логин").fill(ADMIN.login);
  await page.getByLabel("Пароль").fill(ADMIN.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByLabel("Код 2FA или recovery-код")).toBeVisible();
  await page.getByLabel("Код 2FA или recovery-код").fill(firstRecoveryCode);
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("История входов")).toBeVisible();

  const credential = await getPrisma().userTotpCredential.findUnique({
    where: { userId: adminUser!.id },
    select: { recoveryCodesJson: true },
  });

  expect(JSON.parse(credential?.recoveryCodesJson ?? "[]")).toHaveLength(7);
});

test("login is temporarily locked after repeated failed attempts", async ({ page }) => {
  const loginError = page.locator("form p[role='alert']");

  await getPrisma().platformSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      passwordMinLength: 8,
      passwordRequireNumber: false,
      passwordRequireUppercase: false,
      passwordRequireSpecialChar: false,
      sessionMaxAgeMinutes: 180,
      maxFailedLoginAttempts: 2,
      loginLockoutMinutes: 30,
      loginEventRetentionDays: 120,
    },
    update: {
      passwordMinLength: 8,
      passwordRequireNumber: false,
      passwordRequireUppercase: false,
      passwordRequireSpecialChar: false,
      sessionMaxAgeMinutes: 180,
      maxFailedLoginAttempts: 2,
      loginLockoutMinutes: 30,
      loginEventRetentionDays: 120,
    },
  });

  await getPrisma().user.update({
    where: { login: STUDENT.login },
    data: {
      status: "ACTIVE",
      failedLoginAttempts: 0,
      loginLockedUntil: null,
    },
  });

  await page.goto("/login");
  await page.getByLabel("Логин").fill(STUDENT.login);
  await page.getByLabel("Пароль").fill("wrong-password-1");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(loginError).toHaveText("Неверный логин или пароль.");

  await page.getByLabel("Пароль").fill("wrong-password-2");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(loginError).toHaveText("Слишком много неудачных попыток входа. Повторите позже.");

  const lockedUser = await getPrisma().user.findUnique({
    where: { login: STUDENT.login },
    select: {
      failedLoginAttempts: true,
      loginLockedUntil: true,
    },
  });

  expect(lockedUser?.failedLoginAttempts).toBe(0);
  expect(lockedUser?.loginLockedUntil).not.toBeNull();
  expect(lockedUser?.loginLockedUntil instanceof Date).toBe(true);

  await page.getByLabel("Пароль").fill(STUDENT.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(loginError).toHaveText("Слишком много неудачных попыток входа. Повторите позже.");
});
