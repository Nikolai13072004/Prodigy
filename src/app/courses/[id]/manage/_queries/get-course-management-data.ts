import "server-only";

import prisma from "@/lib/prisma";
import type { CourseManualReviewStatusFilter } from "@/lib/course-manual-reviews";
import {
  getCourseManagementLoadPolicy,
  type CourseManagementSection,
} from "@/app/courses/[id]/manage/_queries/management-load-policy";
import {
  readCourseManagementAttention,
  readCourseManagementCore,
  readCourseManagementSection,
} from "@/app/courses/[id]/manage/_queries/course-management-reads";

export async function getCourseManagementData(args: {
  courseId: string;
  canEditCourse: boolean;
  activeSection: CourseManagementSection;
  selectedAttemptId?: string;
  reviewStatusFilter: CourseManualReviewStatusFilter;
}) {
  const load = getCourseManagementLoadPolicy(args.activeSection);
  const [courseCore, attention, section] = await Promise.all([
    readCourseManagementCore(args.courseId),
    readCourseManagementAttention(args.courseId),
    readCourseManagementSection({
      courseId: args.courseId,
      canEditCourse: args.canEditCourse,
      load,
      selectedAttemptId: args.selectedAttemptId,
      reviewStatusFilter: args.reviewStatusFilter,
    }),
  ]);

  return {
    course: courseCore
      ? {
          ...courseCore,
          feedbacks: section.feedbacks,
          surveyTemplate: section.surveyTemplate,
        }
      : null,
    reusableSurveyTemplates: section.reusableSurveyTemplates,
    allUsers: section.allUsers,
    allGroups: section.allGroups,
    broadcastAudience: section.broadcastAudience,
    manualReviewsData: section.manualReviewsData,
    courseEmailJobs: section.courseEmailJobs,
    reportAttempts: section.reportAttempts,
    ...attention,
  };
}

export type CourseManagementData = Awaited<ReturnType<typeof getCourseManagementData>>;

export async function getCourseManagementProgressData(args: {
  courseId: string;
  learnerIds: string[];
  requiredQuizIds: string[];
}) {
  if (args.learnerIds.length === 0) {
    return { requiredQuizBestResults: [], requiredQuizDraftAttempts: [], learnerProgressItems: [] };
  }
  const [requiredQuizBestResults, requiredQuizDraftAttempts, learnerProgressItems] = await Promise.all([
    args.requiredQuizIds.length > 0
      ? prisma.quizUserBestResult.findMany({
          where: { quizId: { in: args.requiredQuizIds }, userId: { in: args.learnerIds } },
          select: { quizId: true, userId: true, status: true },
        })
      : Promise.resolve([]),
    args.requiredQuizIds.length > 0
      ? prisma.quizAttempt.findMany({
          where: {
            quizId: { in: args.requiredQuizIds },
            userId: { in: args.learnerIds },
            outcome: "IN_PROGRESS",
          },
          select: { quizId: true, userId: true },
        })
      : Promise.resolve([]),
    prisma.courseItem.findMany({
      where: { courseId: args.courseId, archivedAt: null },
      orderBy: { orderIndex: "asc" },
      include: {
        views: {
          where: { userId: { in: args.learnerIds } },
          select: { userId: true, progressPercent: true },
        },
        quiz: {
          select: {
            id: true,
            maxAttempts: true,
            minCorrectAnswers: true,
            attempts: {
              where: { userId: { in: args.learnerIds } },
              orderBy: { attemptNumber: "asc" },
              select: {
                userId: true,
                outcome: true,
                correctAnswers: true,
                attemptNumber: true,
                score: true,
                completedAt: true,
              },
            },
          },
        },
      },
    }),
  ]);
  return { requiredQuizBestResults, requiredQuizDraftAttempts, learnerProgressItems };
}

export type CourseManagementProgressData = Awaited<
  ReturnType<typeof getCourseManagementProgressData>
>;
