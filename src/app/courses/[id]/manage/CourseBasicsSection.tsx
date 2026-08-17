import { updateCourse } from "@/app/actions/course-settings-actions";
import { CourseCoverInput } from "@/components/CourseCoverInput";
import { FormAutosaveWatcher } from "@/components/FormAutosaveWatcher";
import { COURSE_CATEGORY_OPTIONS, COURSE_DIFFICULTY_OPTIONS } from "@/lib/course-metadata";
import { COURSE_NAVIGATION_MODE_LABELS, RESULT_VIEW_MODE_LABELS } from "@/lib/constants";

import { CourseViewLinkCopy } from "./CourseViewLinkCopy";
import type { CourseManagementData } from "./_queries/get-course-management-data";

type Props = {
  courseId: string;
  course: NonNullable<CourseManagementData["course"]>;
  courseTags: string[];
  durationHoursValue: string;
  durationMinutesValue: string;
  courseViewUrl: string;
  courseCoverSourcePdfUrl: string | null;
  courseCoverSourcePages: number | null;
};

export function CourseBasicsSection({
  courseId,
  course,
  courseTags,
  durationHoursValue,
  durationMinutesValue,
  courseViewUrl,
  courseCoverSourcePdfUrl,
  courseCoverSourcePages,
}: Props) {
  return (
    <div>
      <form id="course-basics-form" action={updateCourse.bind(null, courseId)} className="space-y-5">
        <div className="grid max-w-5xl gap-x-6 gap-y-4 text-sm md:grid-cols-[185px_minmax(0,1fr)]">
          <label className="pt-2 font-medium text-zinc-700">Название:</label>
          <input
            name="title"
            defaultValue={course.title}
            required
            className="w-full max-w-xl rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
          />

          <label className="pt-2 font-medium text-zinc-700">Описание:</label>
          <textarea
            name="description"
            rows={3}
            defaultValue={course.description ?? ""}
            required
            className="w-full max-w-xl rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
          />

          <label className="pt-2 font-medium text-zinc-700">Требования:</label>
          <textarea
            name="requirements"
            rows={3}
            defaultValue={course.requirements ?? ""}
            placeholder="Например, базовые знания Excel"
            className="w-full max-w-xl rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
          />

          <label className="pt-2 font-medium text-zinc-700">Целевая аудитория:</label>
          <textarea
            name="targetAudience"
            rows={3}
            defaultValue={course.targetAudience ?? ""}
            placeholder="Например, новые сотрудники финансового блока"
            className="w-full max-w-xl rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
          />

          <label className="pt-2 font-medium text-zinc-700">Категория:</label>
          <select
            name="category"
            defaultValue={course.category ?? ""}
            aria-label="Категория"
            className="w-full max-w-sm rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
          >
            <option value="">Не выбрана</option>
            {COURSE_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="pt-2 font-medium text-zinc-700">Уровень сложности:</label>
          <select
            name="difficultyLevel"
            defaultValue={course.difficultyLevel ?? ""}
            aria-label="Уровень сложности"
            className="w-full max-w-sm rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
          >
            <option value="">Не выбран</option>
            {COURSE_DIFFICULTY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="pt-2 font-medium text-zinc-700">Рекомендуемое время:</label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              name="durationHours"
              type="number"
              min={0}
              max={999}
              defaultValue={durationHoursValue}
              aria-label="Рекомендуемое время, часы"
              className="w-20 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
            />
            <span className="text-sm text-zinc-600">часов</span>
            <input
              name="durationMinutes"
              type="number"
              min={0}
              max={59}
              defaultValue={durationMinutesValue}
              aria-label="Рекомендуемое время, минуты"
              className="w-20 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
            />
            <span className="text-sm text-zinc-600">минут</span>
          </div>

          <label className="pt-2 font-medium text-zinc-700">Теги:</label>
          <input
            name="tags"
            defaultValue={courseTags.join(", ")}
            placeholder="Например, продажи, адаптация, регламент"
            className="w-full max-w-xl rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
          />

          <label className="pt-2 font-medium text-zinc-700">Режим прохождения:</label>
          <select
            name="navigationMode"
            defaultValue={course.navigationMode}
            aria-label="Режим прохождения"
            className="w-full max-w-sm rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
          >
            {Object.entries(COURSE_NAVIGATION_MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <label className="pt-2 font-medium text-zinc-700">Показ результата:</label>
          <select
            name="resultViewMode"
            defaultValue={course.resultViewMode}
            aria-label="Режим показа результата"
            className="w-full max-w-sm rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
          >
            {Object.entries(RESULT_VIEW_MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <label className="pt-2 font-medium text-zinc-700">Миниатюра:</label>
          <CourseCoverInput
            initialValue={course.thumbnailUrl ?? null}
            name="thumbnailUrl"
            label="Миниатюра"
            assetKind="thumbnail"
            hint="16:9, минимум 640x360 пикселей. Форматы: JPEG, PNG или GIF."
            showHint={false}
            showLabel={false}
            variant="plain"
            previewAspectRatio="16 / 9"
            previewClassName="w-56"
          />

          <label className="pt-2 font-medium text-zinc-700">Обложка курса:</label>
          <CourseCoverInput
            initialValue={course.coverUrl ?? null}
            sourcePdfUrl={courseCoverSourcePdfUrl}
            maxSourcePages={courseCoverSourcePages}
            label="Обложка курса"
            assetKind="cover"
            hint="Точный размер 1920x500 пикселей. Форматы: JPEG, PNG или GIF."
            showHint={false}
            showLabel={false}
            variant="plain"
            previewAspectRatio="1920 / 500"
            previewClassName="w-full max-w-xl"
          />

          <label className="pt-2 font-medium text-zinc-700">Ссылка на просмотр:</label>
          <CourseViewLinkCopy href={courseViewUrl} />
        </div>

        <div className="flex justify-end border-t border-zinc-100 pt-4">
          <FormAutosaveWatcher formId="course-basics-form" visible={false} />
          <button
            type="submit"
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {course.status === "PUBLISHED" ? "Сохранить изменения" : "Сохранить черновик"}
          </button>
        </div>
      </form>
    </div>
  );
}
