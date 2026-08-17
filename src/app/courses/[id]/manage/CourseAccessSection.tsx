import { deleteCourse, updateCourseStatus } from "@/app/actions/course-settings-actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

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

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-6">
        <h2 className="text-lg font-semibold text-zinc-950">Публикация</h2>

        {sp.statusError ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {sp.statusError}
          </p>
        ) : null}
        {sp.statusSaved ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {sp.statusSaved}
          </p>
        ) : null}

        <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-500">Текущий статус</span>
            <CourseStatusBadge status={course.status} compact />
          </div>
          {course.publishedAt ? (
            <p className="mt-2 text-xs text-zinc-500">
              Последняя публикация: {course.publishedAt.toLocaleString("ru-RU")}
            </p>
          ) : null}
          {course.hasUnpublishedChanges ? (
            <p className="mt-2 text-xs text-amber-700">Есть неопубликованные изменения</p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {canPublishCourse ? (
            <>
              <form action={updateCourseStatus.bind(null, courseId)}>
                <input type="hidden" name="status" value="PUBLISHED" />
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Опубликовать
                </button>
              </form>
              <form action={updateCourseStatus.bind(null, courseId)}>
                <input type="hidden" name="status" value="DRAFT" />
                <ConfirmSubmitButton
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-white"
                  name="confirmAssignedImpact"
                  value="1"
                  confirmMessage="Вернуть курс в черновик? Он будет скрыт от назначенных учеников до следующей публикации."
                >
                  Вернуть в черновик
                </ConfirmSubmitButton>
              </form>
              <form action={updateCourseStatus.bind(null, courseId)}>
                <input type="hidden" name="status" value="ARCHIVED" />
                <button
                  type="submit"
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-white"
                >
                  Архивировать
                </button>
              </form>
            </>
          ) : (
            <p className="text-sm text-zinc-600">Для изменения статуса курса нужны права публикации.</p>
          )}
        </div>

        {canEditCourse ? (
          <form action={deleteCourse.bind(null, courseId)} className="mt-6">
            <button type="submit" className="text-sm text-red-600 underline">
              Удалить курс
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function SectionIntro({ title }: { title: string }) {
  return <h2 className="text-xl font-semibold text-zinc-950">{title}</h2>;
}

function CourseStatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
  const published = status === "PUBLISHED";
  const archived = status === "ARCHIVED";
  const label = published ? "Опубликован" : archived ? "Архив" : "Черновик";
  const classes = published
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : archived
      ? "border-zinc-300 bg-zinc-100 text-zinc-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span className={`inline-flex items-center rounded-full border ${compact ? "px-2.5 py-1 text-xs" : "px-3 py-2 text-sm"} ${classes}`}>
      <span className="font-medium">{label}</span>
    </span>
  );
}
