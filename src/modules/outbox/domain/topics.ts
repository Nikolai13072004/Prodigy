export const OUTBOX_TOPICS = {
  COURSE_ASSIGNED_EMAIL: "enrollment.course-assigned-email.v1",
  COURSE_INVITE_EMAIL: "enrollment.course-invite-email.v1",
} as const;

export type OutboxTopic = (typeof OUTBOX_TOPICS)[keyof typeof OUTBOX_TOPICS];

export type CourseAssignedEmailEvent = {
  recipients: Array<{
    email: string;
    name: string | null;
    firstName: string | null;
  }>;
  courseTitle: string;
  courseUrl: string;
  accessExpiresAt: string | null;
};

export type CourseInviteEmailEvent = {
  recipients: Array<{
    email: string;
    inviteUrl: string;
  }>;
  courseTitle: string;
  accessExpiresAt: string | null;
  linkTtlHours: number;
};
