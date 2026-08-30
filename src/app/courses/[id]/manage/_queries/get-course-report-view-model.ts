import "server-only";

import type { CourseManagementData } from "./get-course-management-data";
import { getCourseManagementProgressData } from "./get-course-management-data";
import { selectAssignedCourseLearners } from "./select-course-assignments";
import { selectCourseCompletionByLearner } from "./select-course-progress-report";
import { selectRequiredQuizStatusReport } from "./select-course-report";
import { selectCourseVersionDiff } from "./select-course-version-diff";

export async function getCourseReportViewModel(args: {
  courseId: string;
  course: NonNullable<CourseManagementData["course"]>;
  users: CourseManagementData["allUsers"];
  attempts: CourseManagementData["reportAttempts"];
}) {
  const assignedLearners = selectAssignedCourseLearners({ users: args.users, course: args.course });
  const requiredQuizIds = args.course.items
    .filter((item) => item.isRequired && item.type === "QUIZ" && item.quiz)
    .map((item) => item.quiz!.id);

  const progressData = await getCourseManagementProgressData({
    courseId: args.courseId,
    learnerIds: assignedLearners.map((learner) => learner.id),
    requiredQuizIds,
  });
  const courseCompletionByUserId = selectCourseCompletionByLearner({
    course: args.course,
    learnerIds: assignedLearners.map((learner) => learner.id),
    items: progressData.learnerProgressItems,
  });

  return {
    metrics: {
      totalAttempts: args.attempts.length,
      passedAttempts: args.attempts.filter((attempt) => attempt.outcome === "PASSED").length,
      usersWithAttempts: new Set(args.attempts.map((attempt) => attempt.user.login)).size,
    },
    requiredQuizReport: selectRequiredQuizStatusReport({
      assignedLearners,
      requiredQuizIds,
      bestResults: progressData.requiredQuizBestResults,
      inProgressAttempts: progressData.requiredQuizDraftAttempts,
      courseCompletionByUserId,
    }),
    courseVersionDiff: selectCourseVersionDiff(args.course),
  };
}

export type CourseReportViewModel = Awaited<ReturnType<typeof getCourseReportViewModel>>;
