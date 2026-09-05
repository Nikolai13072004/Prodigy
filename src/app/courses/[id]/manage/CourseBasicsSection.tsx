import { updateCourse } from "@/app/actions/course-settings-actions";
import { CourseCoverInput } from "@/components/CourseCoverInput";
import { FormAutosaveWatcher } from "@/components/FormAutosaveWatcher";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
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
          <Label className="pt-2">Название:</Label>
          <Input name="title" defaultValue={course.title} required className="max-w-xl" />

          <Label className="pt-2">Описание:</Label>
          <Textarea
            name="description"
            rows={3}
            defaultValue={course.description ?? ""}
            required
            className="max-w-xl"
          />

          <Label className="pt-2">Требования:</Label>
          <Textarea
            name="requirements"
            rows={3}
            defaultValue={course.requirements ?? ""}
            placeholder="Например, базовые знания Excel"
            className="max-w-xl"
          />

          <Label className="pt-2">Целевая аудитория:</Label>
          <Textarea
            name="targetAudience"
            rows={3}
            defaultValue={course.targetAudience ?? ""}
            placeholder="Например, новые сотрудники финансового блока"
            className="max-w-xl"
          />

          <Label className="pt-2">Категория:</Label>
          <Select
            name="category"
            defaultValue={course.category ?? ""}
            aria-label="Категория"
            className="max-w-sm"
          >
            <option value="">Не выбрана</option>
            {COURSE_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Label className="pt-2">Уровень сложности:</Label>
          <Select
            name="difficultyLevel"
            defaultValue={course.difficultyLevel ?? ""}
            aria-label="Уровень сложности"
            className="max-w-sm"
          >
            <option value="">Не выбран</option>
            {COURSE_DIFFICULTY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Label className="pt-2">Рекомендуемое время:</Label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              name="durationHours"
              type="number"
              min={0}
              max={999}
              defaultValue={durationHoursValue}
              aria-label="Рекомендуемое время, часы"
              className="w-20 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
            <span className="text-sm text-[var(--ink-muted)]">часов</span>
            <input
              name="durationMinutes"
              type="number"
              min={0}
              max={59}
              defaultValue={durationMinutesValue}
              aria-label="Рекомендуемое время, минуты"
              className="w-20 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
            <span className="text-sm text-[var(--ink-muted)]">минут</span>
          </div>

          <Label className="pt-2">Теги:</Label>
          <Input
            name="tags"
            defaultValue={courseTags.join(", ")}
            placeholder="Например, продажи, адаптация, регламент"
            className="max-w-xl"
          />

          <Label className="pt-2">Режим прохождения:</Label>
          <Select
            name="navigationMode"
            defaultValue={course.navigationMode}
            aria-label="Режим прохождения"
            className="max-w-sm"
          >
            {Object.entries(COURSE_NAVIGATION_MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          <Label className="pt-2">Показ результата:</Label>
          <Select
            name="resultViewMode"
            defaultValue={course.resultViewMode}
            aria-label="Режим показа результата"
            className="max-w-sm"
          >
            {Object.entries(RESULT_VIEW_MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          <Label className="pt-2">Миниатюра:</Label>
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

          <Label className="pt-2">Обложка курса:</Label>
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

          <Label className="pt-2">Ссылка на просмотр:</Label>
          <CourseViewLinkCopy href={courseViewUrl} />
        </div>

        <div className="flex justify-end border-t border-[var(--line)] pt-4">
          <FormAutosaveWatcher formId="course-basics-form" visible={false} />
          <Button type="submit">
            {course.status === "PUBLISHED" ? "Сохранить изменения" : "Сохранить черновик"}
          </Button>
        </div>
      </form>
    </div>
  );
}
