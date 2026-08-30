import type { CourseAssignmentMode } from "../domain/assignment-plan";
import { planCourseAssignments } from "../domain/assignment-plan";
import { EnrollmentApplicationError } from "./errors";
import type {
  EnrollmentMutationRepository,
  PendingCourseInviteWrite,
} from "./mutation-ports";
import {
  OUTBOX_TOPICS,
  type CourseAssignedEmailEvent,
  type CourseInviteEmailEvent,
} from "@/modules/outbox/domain/topics";

export type ChangeCourseAssignmentsCommand = {
  courseId: string;
  actorId: string;
  mode: CourseAssignmentMode;
  requestedDirectUserIds: string[];
  requestedGroupIds: string[];
  accessExpiresAt: Date | null;
  pendingInviteEmailsToReplace: string[];
  pendingInvites: PendingCourseInviteWrite[];
  effects: {
    actorLogin: string | null;
    actorName: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    courseUrl: string;
    inviteRecipients: Array<{ email: string; inviteUrl: string }>;
    inviteLinkTtlHours: number;
    auditMetadata: Record<string, unknown>;
  };
};

export function createChangeCourseAssignments(repository: EnrollmentMutationRepository) {
  return async function changeCourseAssignments(command: ChangeCourseAssignmentsCommand) {
    return repository.transact(async (transaction) => {
      const current = await transaction.loadState(command.courseId);
      if (!current) {
        throw new EnrollmentApplicationError("COURSE_NOT_FOUND", "Курс не найден");
      }
      if (current.course.status !== "PUBLISHED") {
        throw new EnrollmentApplicationError(
          "COURSE_NOT_PUBLISHED",
          "Назначать пользователей можно только после публикации курса",
        );
      }

      const plan = planCourseAssignments({
        mode: command.mode,
        currentDirectUserIds: current.directUserIds,
        currentGroupIds: current.groupIds,
        requestedDirectUserIds: command.requestedDirectUserIds,
        requestedGroupIds: command.requestedGroupIds,
      });
      await transaction.replaceState({
        courseId: command.courseId,
        actorId: command.actorId,
        directUserIds: plan.directUserIds,
        groupIds: plan.groupIds,
        accessExpiresAt: command.accessExpiresAt,
        pendingInviteDelete: command.mode === "ADD"
          ? [...new Set(command.pendingInviteEmailsToReplace)]
          : "ALL",
        pendingInvites: command.mode === "CLEAR" ? [] : command.pendingInvites,
      });

      const previousAssignedUserIds = new Set([
        ...current.directUserIds,
        ...current.inheritedUserIds,
      ]);
      const recipients = await transaction.findActiveRecipients(
        plan.directUserIds,
        plan.groupIds,
      );
      const newlyAssignedRecipients = recipients.filter(
        (recipient) => !previousAssignedUserIds.has(recipient.userId),
      );
      const outboxEvents: Array<{ topic: string; payload: unknown }> = [];
      if (newlyAssignedRecipients.length > 0) {
        const payload: CourseAssignedEmailEvent = {
          recipients: newlyAssignedRecipients.map(({ email, name, firstName }) => ({
            email,
            name,
            firstName,
          })),
          courseTitle: current.course.title,
          courseUrl: command.effects.courseUrl,
          accessExpiresAt: command.accessExpiresAt?.toISOString() ?? null,
        };
        outboxEvents.push({ topic: OUTBOX_TOPICS.COURSE_ASSIGNED_EMAIL, payload });
      }
      if (command.effects.inviteRecipients.length > 0) {
        const payload: CourseInviteEmailEvent = {
          recipients: command.effects.inviteRecipients,
          courseTitle: current.course.title,
          accessExpiresAt: command.accessExpiresAt?.toISOString() ?? null,
          linkTtlHours: command.effects.inviteLinkTtlHours,
        };
        outboxEvents.push({ topic: OUTBOX_TOPICS.COURSE_INVITE_EMAIL, payload });
      }
      await transaction.recordEffects({
        audit: {
          actorId: command.actorId,
          actorLogin: command.effects.actorLogin,
          actorName: command.effects.actorName,
          action: "courses:assign",
          objectType: "course",
          objectId: command.courseId,
          objectLabel: current.course.title,
          ipAddress: command.effects.ipAddress,
          userAgent: command.effects.userAgent,
          metadata: {
            ...command.effects.auditMetadata,
            assignmentMode: command.mode,
            directUserIds: plan.directUserIds,
            groupIds: plan.groupIds,
            inviteEmails: command.effects.inviteRecipients.map((recipient) => recipient.email),
            accessExpiresAt: command.accessExpiresAt,
          },
        },
        outboxEvents,
      });
      return {
        course: current.course,
        directUserIds: plan.directUserIds,
        groupIds: plan.groupIds,
        newlyAssignedRecipients,
      };
    });
  };
}
