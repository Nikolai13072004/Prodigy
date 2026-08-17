import { publishCourseFeedback } from "@/app/actions/course-feedback-actions";
import { COURSE_FEEDBACK_STATUS_LABELS } from "@/lib/constants";

import type { CourseManagementData } from "./_queries/get-course-management-data";

type Props = {
  courseId: string;
  feedbacks: NonNullable<CourseManagementData["course"]>["feedbacks"];
  savedMessage?: string;
  errorMessage?: string;
};

export function CourseFeedbackSection({
  courseId,
  feedbacks,
  savedMessage,
  errorMessage,
}: Props) {
  return (
    <div className="space-y-6">
      {savedMessage ? <Notice tone="success">{savedMessage}</Notice> : null}
      {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Отзывы</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Последняя обратная связь сотрудников по курсу и его материалам.
          </p>
        </div>
        <span className="text-sm text-zinc-500">{feedbacks.length} отзывов</span>
      </div>

      {feedbacks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 px-4 py-5 text-sm text-zinc-600">
          Отзывов пока нет.
        </p>
      ) : (
        <ul className="space-y-4">
          {feedbacks.map((feedback) => (
            <li key={feedback.id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap gap-2 text-sm text-zinc-500">
                <span>{feedback.user.name}</span><span>·</span>
                <span>Логин: {feedback.user.login}</span><span>·</span>
                <span>Оценка: {feedback.rating}/5</span><span>·</span>
                <FeedbackStatus status={feedback.status} /><span>·</span>
                <span>{feedback.createdAt.toLocaleString("ru-RU")}</span>
              </div>
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Комментарий</p>
                {feedback.comment?.trim() ? (
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-800">{feedback.comment}</p>
                ) : (
                  <p className="mt-2 text-sm text-zinc-500">Комментарий не указан.</p>
                )}
              </div>
              {feedback.status === "PENDING" ? (
                <form action={publishCourseFeedback.bind(null, courseId, feedback.id)} className="mt-3">
                  <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100">
                    Опубликовать
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Notice({ children, tone }: { children: string; tone: "success" | "error" }) {
  return <p className={`rounded-xl border px-3 py-2 text-sm ${tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{children}</p>;
}

function FeedbackStatus({ status }: { status: string }) {
  const published = status === "PUBLISHED";
  const label = COURSE_FEEDBACK_STATUS_LABELS[published ? "PUBLISHED" : "PENDING"];
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${published ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{label}</span>;
}
