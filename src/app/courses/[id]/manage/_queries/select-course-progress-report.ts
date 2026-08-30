import { getCourseProgress } from "@/lib/course-progress";

type CourseProgressReadItem = {
  id: string;
  type: string;
  isRequired: boolean;
  views: Array<{ userId: string; progressPercent: number }>;
  quiz: {
    id: string;
    maxAttempts: number;
    minCorrectAnswers: number;
    attempts: Array<{
      userId: string;
      outcome: string;
      correctAnswers: number;
      attemptNumber: number;
      score: number;
      completedAt: Date;
    }>;
  } | null;
};

export function selectCourseCompletionByLearner(args: {
  course: { title: string; description: string | null; quizGateMode: string };
  learnerIds: string[];
  items: CourseProgressReadItem[];
}) {
  const materialProgress = new Map<string, number>();
  const quizAttempts = new Map<
    string,
    Array<{
      outcome: string;
      correctAnswers: number;
      attemptNumber: number;
      score: number;
      completedAt: Date;
    }>
  >();

  for (const item of args.items) {
    for (const view of item.views) {
      materialProgress.set(`${view.userId}:${item.id}`, view.progressPercent);
    }
    if (!item.quiz) continue;
    for (const attempt of item.quiz.attempts) {
      const key = `${attempt.userId}:${item.quiz.id}`;
      quizAttempts.set(key, [...(quizAttempts.get(key) ?? []), attempt]);
    }
  }

  return new Map(
    args.learnerIds.map((learnerId) => {
      const progress = getCourseProgress({
        courseTitle: args.course.title,
        courseDescription: args.course.description,
        quizGateMode: args.course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
        items: args.items.map((item) => {
          const itemProgress = materialProgress.get(`${learnerId}:${item.id}`) ?? 0;
          return {
            id: item.id,
            type: item.type,
            isRequired: item.isRequired,
            viewed: item.type === "QUIZ" ? false : itemProgress > 0,
            materialProgress: item.type === "QUIZ" ? 0 : itemProgress,
            quiz: item.quiz
              ? {
                  maxAttempts: item.quiz.maxAttempts,
                  minCorrectAnswers: item.quiz.minCorrectAnswers,
                  attempts: quizAttempts.get(`${learnerId}:${item.quiz.id}`) ?? [],
                }
              : null,
          };
        }),
      });
      return [learnerId, progress.isCompleted] as const;
    })
  );
}
