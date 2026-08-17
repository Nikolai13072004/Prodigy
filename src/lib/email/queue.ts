import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { buildCourseAssignedEmailTemplate } from "@/lib/email/template-course-assigned";
import { buildCourseAccessExtendedEmailTemplate } from "@/lib/email/template-course-access-extended";
import { buildCourseBroadcastEmailTemplate } from "@/lib/email/template-course-broadcast";
import { buildCourseInviteEmailTemplate } from "@/lib/email/template-course-invite";
import {
  buildCourseReminderEmailTemplate,
  type CourseReminderType,
} from "@/lib/email/template-course-reminder";
import { buildCourseSurveyReportEmailTemplate } from "@/lib/email/template-course-survey-report";
import { buildQuizReviewedEmailTemplate } from "@/lib/email/template-quiz-reviewed";
import { buildStudentInviteEmailTemplate } from "@/lib/email/template-student-invite";
import { buildUserActivationEmailTemplate } from "@/lib/email/template-user-activation";
import { buildUserAccessEmailTemplate } from "@/lib/email/template-user-access";
import { buildPasswordResetLinkEmailTemplate } from "@/lib/email/template-password-reset-link";
import { emailGreetingName } from "@/lib/email/template-format";
import { getPlatformSettings } from "@/lib/platform-settings";

const DEFAULT_MAX_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 60_000;
const RETRY_MAX_DELAY_MS = 60 * 60 * 1000;

type Recipient = {
  email: string;
  name?: string | null;
  firstName?: string | null;
};

type InviteRecipient = {
  email: string;
  name?: string | null;
  firstName?: string | null;
  inviteUrl: string;
};

type CourseAssignedPayload = {
  courseTitle: string;
  courseUrl: string;
  accessExpiresAt: Date | null;
};

type CourseAccessExtendedPayload = {
  courseId: string;
  courseTitle: string;
  courseUrl: string;
  previousAccessLabel: string;
  nextAccessLabel: string;
};

type CourseBroadcastPayload = {
  courseId: string;
  courseTitle: string;
  courseUrl: string;
  messageSubject: string;
  messageBody: string;
  groupId?: string | null;
  groupName?: string | null;
};

type CourseInvitePayload = {
  courseTitle: string;
  accessExpiresAt: Date | null;
  linkTtlHours: number;
};

type CourseReminderPayload = {
  courseId: string;
  courseTitle: string;
  courseUrl: string;
  type: CourseReminderType;
  deadlineLabel?: string | null;
};

type QuizReviewedPayload = {
  courseId: string;
  courseTitle: string;
  quizId: string;
  quizTitle: string;
  resultUrl: string;
  outcome: "PASSED" | "FAILED";
  reviewComment?: string | null;
  reviewedAt: Date;
};

type CourseSurveyReportPayload = {
  courseId: string;
  courseTitle: string;
  surveyTitle: string;
  learnerId: string;
  learnerName: string;
  learnerEmail?: string | null;
  submittedAt: Date;
  manageUrl: string;
  answers: Array<{
    questionTitle: string;
    questionType: "RATING_5" | "SINGLE_CHOICE" | "TEXT";
    answerText: string | null;
  }>;
};

type StudentInviteRecipient = {
  email: string;
  name?: string | null;
  firstName?: string | null;
  login: string;
  temporaryPassword: string;
};

type StudentInvitePayload = {
  loginUrl: string;
};

type UserAccessRecipient = {
  email: string;
  name?: string | null;
  firstName?: string | null;
  login: string;
  temporaryPassword: string;
};

type UserAccessPayload = {
  loginUrl: string;
  reason: "ACCOUNT_CREATED" | "PASSWORD_RESET";
};

type PasswordResetLinkRecipient = {
  email: string;
  name?: string | null;
  firstName?: string | null;
  login: string;
  resetUrl: string;
};

type UserActivationRecipient = {
  email: string;
  name?: string | null;
  firstName?: string | null;
  login: string;
  activationUrl: string;
};

function emailTemplateName(recipient: { firstName?: string | null; name?: string | null }) {
  return recipient.firstName?.trim() || emailGreetingName(recipient.name);
}

function emailTemplateFullName(recipient: { firstName?: string | null; name?: string | null }) {
  return recipient.name?.trim() || emailTemplateName(recipient) || "Пользователь";
}

function nextAttemptDate(attempts: number) {
  const delay = Math.min(RETRY_BASE_DELAY_MS * Math.max(1, attempts), RETRY_MAX_DELAY_MS);
  return new Date(Date.now() + delay);
}

export async function enqueueCourseAssignedEmails(
  recipients: Recipient[],
  payload: CourseAssignedPayload,
  options?: {
    client?: Prisma.TransactionClient;
    settings?: Awaited<ReturnType<typeof getPlatformSettings>>;
  },
) {
  if (recipients.length === 0) return;

  const settings = options?.settings ?? await getPlatformSettings();
  const client = options?.client ?? prisma;

  const data = recipients.map((recipient) => {
    const template = buildCourseAssignedEmailTemplate({
      assigneeName: emailTemplateFullName(recipient),
      assigneeFirstName: emailTemplateName(recipient),
      courseTitle: payload.courseTitle,
      courseUrl: payload.courseUrl,
      accessExpiresAt: payload.accessExpiresAt,
      template: settings.courseAssignedEmailTemplate,
    });

    return {
      toEmail: recipient.email,
      toName: recipient.name ?? null,
      subject: template.subject,
      htmlBody: template.html,
      textBody: template.text,
      template: "COURSE_ASSIGNED",
      payloadJson: JSON.stringify(payload),
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    };
  });

  await client.emailJob.createMany({ data });
}

export async function enqueueCourseAccessExtendedEmails(
  recipients: Recipient[],
  payload: CourseAccessExtendedPayload
) {
  if (recipients.length === 0) return;

  const data = recipients.map((recipient) => {
    const template = buildCourseAccessExtendedEmailTemplate({
      recipientName: emailTemplateName(recipient),
      courseTitle: payload.courseTitle,
      courseUrl: payload.courseUrl,
      previousAccessLabel: payload.previousAccessLabel,
      nextAccessLabel: payload.nextAccessLabel,
    });

    return {
      toEmail: recipient.email,
      toName: recipient.name ?? null,
      subject: template.subject,
      htmlBody: template.html,
      textBody: template.text,
      template: "COURSE_ACCESS_EXTENDED",
      payloadJson: JSON.stringify(payload),
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    };
  });

  await prisma.emailJob.createMany({ data });
}

export async function enqueueCourseBroadcastEmails(recipients: Recipient[], payload: CourseBroadcastPayload) {
  if (recipients.length === 0) return;

  const data = recipients.map((recipient) => {
    const template = buildCourseBroadcastEmailTemplate({
      recipientName: emailTemplateName(recipient),
      courseTitle: payload.courseTitle,
      courseUrl: payload.courseUrl,
      messageSubject: payload.messageSubject,
      messageBody: payload.messageBody,
      groupName: payload.groupName,
    });

    return {
      toEmail: recipient.email,
      toName: recipient.name ?? null,
      subject: template.subject,
      htmlBody: template.html,
      textBody: template.text,
      template: "COURSE_BROADCAST",
      payloadJson: JSON.stringify({
        courseId: payload.courseId,
        courseTitle: payload.courseTitle,
        groupId: payload.groupId ?? null,
        groupName: payload.groupName ?? null,
        messageSubject: payload.messageSubject,
        messageBody: payload.messageBody,
      }),
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    };
  });

  await prisma.emailJob.createMany({ data });
}

export async function enqueueCourseInviteEmails(
  recipients: InviteRecipient[],
  payload: CourseInvitePayload,
  options?: { client?: Prisma.TransactionClient },
) {
  if (recipients.length === 0) return;

  const data = recipients.map((recipient) => {
    const template = buildCourseInviteEmailTemplate({
      courseTitle: payload.courseTitle,
      inviteUrl: recipient.inviteUrl,
      linkTtlHours: payload.linkTtlHours,
      accessExpiresAt: payload.accessExpiresAt,
    });

    return {
      toEmail: recipient.email,
      toName: recipient.name ?? null,
      subject: template.subject,
      htmlBody: template.html,
      textBody: template.text,
      template: "COURSE_INVITE",
      payloadJson: JSON.stringify({
        ...payload,
        accessExpiresAt: payload.accessExpiresAt?.toISOString() ?? null,
        inviteUrl: recipient.inviteUrl,
        linkTtlHours: payload.linkTtlHours,
      }),
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    };
  });

  const client = options?.client ?? prisma;
  await client.emailJob.createMany({ data });
}

export async function enqueueCourseReminderEmails(recipients: Recipient[], payload: CourseReminderPayload) {
  if (recipients.length === 0) return;

  const data = recipients.map((recipient) => {
    const template = buildCourseReminderEmailTemplate({
      recipientName: emailTemplateName(recipient),
      courseTitle: payload.courseTitle,
      courseUrl: payload.courseUrl,
      type: payload.type,
      deadlineLabel: payload.deadlineLabel,
    });

    return {
      toEmail: recipient.email,
      toName: recipient.name ?? null,
      subject: template.subject,
      htmlBody: template.html,
      textBody: template.text,
      template: `COURSE_REMINDER_${payload.type}`,
      payloadJson: JSON.stringify(payload),
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    };
  });

  await prisma.emailJob.createMany({ data });
}

export async function enqueueQuizReviewedEmails(recipients: Recipient[], payload: QuizReviewedPayload) {
  if (recipients.length === 0) return;

  const data = recipients.map((recipient) => {
    const template = buildQuizReviewedEmailTemplate({
      recipientName: emailTemplateName(recipient),
      courseTitle: payload.courseTitle,
      quizTitle: payload.quizTitle,
      resultUrl: payload.resultUrl,
      outcome: payload.outcome,
      reviewComment: payload.reviewComment,
    });

    return {
      toEmail: recipient.email,
      toName: recipient.name ?? null,
      subject: template.subject,
      htmlBody: template.html,
      textBody: template.text,
      template: "QUIZ_REVIEWED",
      payloadJson: JSON.stringify({
        courseId: payload.courseId,
        courseTitle: payload.courseTitle,
        quizId: payload.quizId,
        quizTitle: payload.quizTitle,
        resultUrl: payload.resultUrl,
        outcome: payload.outcome,
        reviewComment: payload.reviewComment ?? null,
        reviewedAt: payload.reviewedAt.toISOString(),
      }),
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    };
  });

  await prisma.emailJob.createMany({ data });
}

export async function enqueueCourseSurveyReportEmails(recipients: Recipient[], payload: CourseSurveyReportPayload) {
  if (recipients.length === 0) return;

  const data = recipients.map((recipient) => {
    const template = buildCourseSurveyReportEmailTemplate({
      recipientName: emailTemplateName(recipient),
      courseTitle: payload.courseTitle,
      surveyTitle: payload.surveyTitle,
      learnerName: payload.learnerName,
      learnerEmail: payload.learnerEmail,
      submittedAt: payload.submittedAt,
      manageUrl: payload.manageUrl,
      answers: payload.answers,
    });

    return {
      toEmail: recipient.email,
      toName: recipient.name ?? null,
      subject: template.subject,
      htmlBody: template.html,
      textBody: template.text,
      template: "COURSE_SURVEY_REPORT",
      payloadJson: JSON.stringify({
        ...payload,
        submittedAt: payload.submittedAt.toISOString(),
      }),
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    };
  });

  await prisma.emailJob.createMany({ data });
}

export async function enqueueStudentInviteEmails(recipients: StudentInviteRecipient[], payload: StudentInvitePayload) {
  if (recipients.length === 0) return;
  const settings = await getPlatformSettings();

  const data = recipients.map((recipient) => {
    const template = buildStudentInviteEmailTemplate({
      studentName: emailTemplateFullName(recipient),
      firstName: emailTemplateName(recipient),
      login: recipient.login,
      temporaryPassword: recipient.temporaryPassword,
      loginUrl: payload.loginUrl,
      templateCopy: settings.welcomeEmailTemplate,
    });

    return {
      toEmail: recipient.email,
      toName: recipient.name ?? null,
      subject: template.subject,
      htmlBody: template.html,
      textBody: template.text,
      template: "STUDENT_INVITE",
      payloadJson: JSON.stringify({ loginUrl: payload.loginUrl, login: recipient.login }),
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    };
  });

  await prisma.emailJob.createMany({ data });
}

export async function enqueueUserAccessEmails(recipients: UserAccessRecipient[], payload: UserAccessPayload) {
  if (recipients.length === 0) return;
  const settings = await getPlatformSettings();

  const data = recipients.map((recipient) => {
    const template = buildUserAccessEmailTemplate({
      userName: emailTemplateFullName(recipient),
      firstName: emailTemplateName(recipient),
      login: recipient.login,
      temporaryPassword: recipient.temporaryPassword,
      loginUrl: payload.loginUrl,
      reason: payload.reason,
      templateCopy:
        payload.reason === "ACCOUNT_CREATED"
          ? settings.welcomeEmailTemplate
          : settings.passwordResetEmailTemplate,
    });

    return {
      toEmail: recipient.email,
      toName: recipient.name ?? null,
      subject: template.subject,
      htmlBody: template.html,
      textBody: template.text,
      template: "USER_ACCESS",
      payloadJson: JSON.stringify({
        loginUrl: payload.loginUrl,
        login: recipient.login,
        reason: payload.reason,
      }),
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    };
  });

  await prisma.emailJob.createMany({ data });
}

export async function enqueuePasswordResetLinkEmails(
  recipients: PasswordResetLinkRecipient[],
  payload: { linkTtlLabel: string },
) {
  if (recipients.length === 0) return;

  const data = recipients.map((recipient) => {
    const template = buildPasswordResetLinkEmailTemplate({
      userName: emailTemplateFullName(recipient),
      firstName: emailTemplateName(recipient),
      login: recipient.login,
      resetUrl: recipient.resetUrl,
      linkTtlLabel: payload.linkTtlLabel,
    });

    return {
      toEmail: recipient.email,
      toName: recipient.name ?? null,
      subject: template.subject,
      htmlBody: template.html,
      textBody: template.text,
      template: "PASSWORD_RESET_LINK",
      payloadJson: JSON.stringify({
        login: recipient.login,
        resetUrl: recipient.resetUrl,
      }),
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    };
  });

  await prisma.emailJob.createMany({ data });
}

export async function enqueueUserActivationEmails(recipients: UserActivationRecipient[]) {
  if (recipients.length === 0) return;
  const settings = await getPlatformSettings();

  const data = recipients.map((recipient) => {
    const template = buildUserActivationEmailTemplate({
      userName: emailTemplateFullName(recipient),
      firstName: emailTemplateName(recipient),
      login: recipient.login,
      activationUrl: recipient.activationUrl,
      linkTtlHours: settings.userActivationInviteTtlDays * 24,
      templateCopy: settings.welcomeEmailTemplate,
    });

    return {
      toEmail: recipient.email,
      toName: recipient.name ?? null,
      subject: template.subject,
      htmlBody: template.html,
      textBody: template.text,
      template: "USER_ACTIVATION",
      payloadJson: JSON.stringify({
        activationUrl: recipient.activationUrl,
        linkTtlHours: settings.userActivationInviteTtlDays * 24,
        login: recipient.login,
      }),
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    };
  });

  await prisma.emailJob.createMany({ data });
}

export async function pickEmailJobs(limit: number) {
  const now = new Date();
  const jobs = await prisma.emailJob.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      nextAttemptAt: { lte: now },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  return jobs;
}

export async function claimEmailJob(jobId: string) {
  const result = await prisma.emailJob.updateMany({
    where: {
      id: jobId,
      status: { in: ["PENDING", "FAILED"] },
    },
    data: { status: "PROCESSING" },
  });
  return result.count > 0;
}

export async function markEmailJobSent(jobId: string) {
  await prisma.emailJob.update({
    where: { id: jobId },
    data: {
      status: "SENT",
      sentAt: new Date(),
      lastError: null,
    },
  });
}

export async function markEmailJobFailed(jobId: string, attemptsDone: number, message: string, maxAttempts: number) {
  const failedPermanently = attemptsDone >= maxAttempts;
  await prisma.emailJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      attempts: attemptsDone,
      lastError: message.slice(0, 2000),
      nextAttemptAt: failedPermanently ? null : nextAttemptDate(attemptsDone),
    },
  });
}
