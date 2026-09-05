import { deleteCourse, updateCourseStatus } from "@/app/actions/course-settings-actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { Badge, Button, buttonStyles } from "@/components/ui";

import type { CourseManagementData } from "./_queries/get-course-management-data";

type Props = {
  courseId: string;
  course: NonNullable<CourseManagementData["course"]>;
  canPublishCourse: boolean;
  canEditCourse: boolean;
  messages: { statusSaved?: string; statusError?: string };
};

export function CourseAccessSection({
  courseId,
  course,
  canPublishCourse,
  canEditCourse,
  messages: sp,
}: Props) {
  return (
    <div className="space-y-6">
      <SectionIntro title="Управление доступом" />

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Публикация</h2>

        {sp.statusError ? (
          <p className="mt-4 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
            {sp.statusError}
          </p>
        ) : null}
        {sp.statusSaved ? (
          <p className="mt-4 rounded-xl border border-[var(--success)] bg-[var(--success-soft)] px-3 py-2 text-sm text-[var(--success)]">
            {sp.statusSaved}
          </p>
        ) : null}

        <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Текущий статус</span>
            <CourseStatusBadge status={course.status} />
          </div>
          {course.publishedAt ? (
            <p className="mt-2 text-xs text-[var(--ink-muted)]">
              Последняя публикация: {course.publishedAt.toLocaleString("ru-RU")}
            </p>
          ) : null}
          {course.hasUnpublishedChanges ? (
            <p className="mt-2 text-xs text-[var(--warning)]">Есть неопубликованные изменения</p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {canPublishCourse ? (
            <>
              <form action={updateCourseStatus.bind(null, courseId)}>
                <input type="hidden" name="status" value="PUBLISHED" />
                <Button type="submit">Опубликовать</Button>
              </form>
              <form action={updateCourseStatus.bind(null, courseId)}>
                <input type="hidden" name="status" value="DRAFT" />
                <ConfirmSubmitButton
                  className={buttonStyles("secondary")}
                  name="confirmAssignedImpact"
                  value="1"
                  confirmMessage="Вернуть курс в черновик? Он будет скрыт от назначенных учеников до следующей публикации."
                >
                  Вернуть в черновик
                </ConfirmSubmitButton>
              </form>
              <form action={updateCourseStatus.bind(null, courseId)}>
                <input type="hidden" name="status" value="ARCHIVED" />
                <Button type="submit" variant="secondary">
                  Архивировать
                </Button>
              </form>
            </>
          ) : (
            <p className="text-sm text-[var(--ink-muted)]">Для изменения статуса курса нужны права публикации.</p>
          )}
        </div>

        {canEditCourse ? (
          <form action={deleteCourse.bind(null, courseId)} className="mt-6">
            <button type="submit" className="text-sm text-[var(--danger)] underline">
              Удалить курс
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function SectionIntro({ title }: { title: string }) {
  return <h2 className="text-xl font-semibold text-[var(--ink)]">{title}</h2>;
}

function CourseStatusBadge({ status }: { status: string }) {
  const published = status === "PUBLISHED";
  const archived = status === "ARCHIVED";
  const label = published ? "Опубликован" : archived ? "Архив" : "Черновик";
  return <Badge tone={published ? "success" : archived ? "neutral" : "warning"}>{label}</Badge>;
}
