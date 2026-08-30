import { publishCourseFeedback } from "@/app/actions/course-feedback-actions";
import { Badge, Button } from "@/components/ui";
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
          <h2 className="text-xl font-semibold text-[var(--ink)]">Отзывы</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Последняя обратная связь сотрудников по курсу и его материалам.
          </p>
        </div>
        <span className="text-sm text-[var(--ink-muted)]">{feedbacks.length} отзывов</span>
      </div>

      {feedbacks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-5 text-sm text-[var(--ink-muted)]">
          Отзывов пока нет.
        </p>
      ) : (
        <ul className="space-y-4">
          {feedbacks.map((feedback) => (
            <li key={feedback.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
              <div className="flex flex-wrap gap-2 text-sm text-[var(--ink-muted)]">
                <span>{feedback.user.name}</span><span>·</span>
                <span>Логин: {feedback.user.login}</span><span>·</span>
                <span>Оценка: {feedback.rating}/5</span><span>·</span>
                <FeedbackStatus status={feedback.status} /><span>·</span>
                <span>{feedback.createdAt.toLocaleString("ru-RU")}</span>
              </div>
              <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Комментарий</p>
                {feedback.comment?.trim() ? (
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--ink)]">{feedback.comment}</p>
                ) : (
                  <p className="mt-2 text-sm text-[var(--ink-muted)]">Комментарий не указан.</p>
                )}
              </div>
              {feedback.status === "PENDING" ? (
                <form action={publishCourseFeedback.bind(null, courseId, feedback.id)} className="mt-3">
                  <Button type="submit" variant="secondary">
                    Опубликовать
                  </Button>
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
  return (
    <p
      className={`rounded-xl border px-3 py-2 text-sm ${
        tone === "success"
          ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
          : "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
      }`}
    >
      {children}
    </p>
  );
}

function FeedbackStatus({ status }: { status: string }) {
  const published = status === "PUBLISHED";
  const label = COURSE_FEEDBACK_STATUS_LABELS[published ? "PUBLISHED" : "PENDING"];
  return <Badge tone={published ? "success" : "warning"}>{label}</Badge>;
}
