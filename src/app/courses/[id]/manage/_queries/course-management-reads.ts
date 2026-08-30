import "server-only";

import prisma from "@/lib/prisma";
import { getCourseBroadcastAudience } from "@/lib/course-broadcasts";
import {
  getCourseManualReviewsData,
  type CourseManualReviewStatusFilter,
} from "@/lib/course-manual-reviews";
import { ROLES } from "@/lib/roles";

import type { CourseManagementLoadPolicy } from "./management-load-policy";

export function readCourseManagementCore(courseId: string) {
  return prisma.course.findUnique({
    where: { id: courseId },
    include: {
      modules: { where: { archivedAt: null }, orderBy: { orderIndex: "asc" } },
      items: {
        where: { archivedAt: null },
        orderBy: { orderIndex: "asc" },
        include: {
          module: { select: { id: true, title: true, description: true, orderIndex: true } },
          quiz: {
            select: {
              id: true,
              maxAttempts: true,
              minCorrectAnswers: true,
              questions: {
                where: { archivedAt: null },
                orderBy: { orderIndex: "asc" },
                select: { id: true },
              },
            },
          },
        },
      },
      directAssignments: { select: { userId: true, assignedAt: true, expiresAt: true } },
      groupAssignments: { select: { groupId: true, assignedAt: true, expiresAt: true } },
      invites: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: { email: true, accessExpiresAt: true },
      },
    },
  });
}

export async function readCourseManagementAttention(courseId: string) {
  const [pendingReviewCount, pendingFeedbackCount, feedbackCount, failedEmailCount] =
    await Promise.all([
      prisma.quizAttempt.count({
        where: { outcome: "PENDING_REVIEW", quiz: { courseItem: { courseId } } },
      }),
      prisma.courseFeedback.count({ where: { courseId, status: "PENDING" } }),
      prisma.courseFeedback.count({ where: { courseId } }),
      prisma.emailJob.count({
        where: { status: "FAILED", payloadJson: { contains: courseId } },
      }),
    ]);
  return { pendingReviewCount, pendingFeedbackCount, feedbackCount, failedEmailCount };
}

export async function readCourseManagementSection(args: {
  courseId: string;
  canEditCourse: boolean;
  load: CourseManagementLoadPolicy;
  selectedAttemptId?: string;
  reviewStatusFilter: CourseManualReviewStatusFilter;
}) {
  const [
    feedbacks,
    surveyTemplate,
    reusableSurveyTemplates,
    allUsers,
    allGroups,
    broadcastAudience,
    manualReviewsData,
    courseEmailJobs,
    reportQuizzes,
  ] = await Promise.all([
    args.load.feedback
      ? prisma.courseFeedback.findMany({
          where: { courseId: args.courseId },
          orderBy: { createdAt: "desc" },
          include: { user: { select: { name: true, login: true } } },
          take: 20,
        })
      : Promise.resolve([]),
    args.load.survey
      ? prisma.courseSurveyTemplate.findUnique({
          where: { courseId: args.courseId },
          include: {
            questions: { orderBy: { orderIndex: "asc" } },
            responses: {
              orderBy: { createdAt: "desc" },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    login: true,
                    department: { select: { name: true } },
                  },
                },
                answers: {
                  include: {
                    question: {
                      select: {
                        id: true,
                        title: true,
                        type: true,
                        optionsJson: true,
                        orderIndex: true,
                      },
                    },
                  },
                },
              },
              take: 100,
            },
          },
        })
      : Promise.resolve(null),
    args.canEditCourse && args.load.survey
      ? prisma.reusableCourseSurveyTemplate.findMany({
          orderBy: { updatedAt: "desc" },
          take: 50,
          include: {
            questions: {
              orderBy: { orderIndex: "asc" },
              select: { id: true, title: true, type: true, optionsJson: true, isRequired: true },
            },
          },
        })
      : Promise.resolve([]),
    args.load.assignmentDirectory
      ? prisma.user.findMany({
          where: {
            OR: [
              { role: ROLES.STUDENT },
              { userRoles: { some: { roleProfile: { name: ROLES.STUDENT } } } },
            ],
          },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            login: true,
            status: true,
            department: { select: { name: true } },
            groupMemberships: { include: { group: true } },
          },
        })
      : Promise.resolve([]),
    args.load.assignmentDirectory
      ? prisma.group.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
    args.load.broadcastAudience
      ? getCourseBroadcastAudience(args.courseId)
      : Promise.resolve(null),
    args.load.manualReviews && args.canEditCourse
      ? getCourseManualReviewsData({
          courseId: args.courseId,
          selectedAttemptId: args.selectedAttemptId,
          statusFilter: args.reviewStatusFilter,
        })
      : Promise.resolve(null),
    args.load.reportData
      ? prisma.emailJob.findMany({
          where: { payloadJson: { contains: args.courseId } },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            toEmail: true,
            toName: true,
            subject: true,
            template: true,
            status: true,
            attempts: true,
            lastError: true,
            createdAt: true,
            sentAt: true,
          },
        })
      : Promise.resolve([]),
    args.load.reportData
      ? prisma.quiz.findMany({
          where: { courseItem: { courseId: args.courseId, archivedAt: null } },
          select: {
            courseItem: { select: { title: true } },
            attempts: {
              orderBy: { completedAt: "desc" },
              take: 10,
              include: { user: { select: { name: true, login: true } } },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const reportAttempts = reportQuizzes
    .flatMap((quiz) =>
      quiz.attempts.map((attempt) => ({ ...attempt, quizTitle: quiz.courseItem.title }))
    )
    .sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime());

  return {
    feedbacks,
    surveyTemplate,
    reusableSurveyTemplates,
    allUsers,
    allGroups,
    broadcastAudience,
    manualReviewsData,
    courseEmailJobs,
    reportAttempts,
  };
}
