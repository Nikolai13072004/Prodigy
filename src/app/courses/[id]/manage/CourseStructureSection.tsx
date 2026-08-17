import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileText,
  Film,
  Files,
  MoreVertical,
  Pencil,
} from "lucide-react";
import {
  deleteCourseItem,
  deleteCourseModule,
  moveCourseItem,
  updateCourseItem,
  updateCourseModule,
} from "@/app/actions/course-content-actions";
import { CourseItemActionsAutoClose } from "./CourseItemActionsAutoClose";
import { CourseModalAutoClose } from "./CourseModalAutoClose";
import { CoursePassingSettingsDialog } from "./CoursePassingSettingsDialog";
import { CourseStructureAddMenu } from "./CourseStructureAddMenu";
import { CourseItemPresentationFields } from "./CourseItemCreateFields";
import { FileUrlInput } from "@/components/FileUrlInput";
import { RichTextEditorField } from "@/components/RichTextEditorField";
import {
  COURSE_ITEM_LABELS,
  normalizePresentationViewMode,
  type CourseCompletionMode,
  type CourseNavigationMode,
  type CourseQuizGateMode,
  type CourseStatusFormat,
} from "@/lib/constants";

type StructureModule = {
  id: string;
  title: string;
  description: string | null;
};

type StructureItem = {
  id: string;
  moduleId: string | null;
  type: string;
  title: string;
  content: string | null;
  fileUrl: string | null;
  totalSlides: number | null;
  presentationViewMode: string;
  isRequired: boolean;
  module: { title: string } | null;
  quiz: { id: string } | null;
};

type StructureGroup = {
  id: string | null;
  title: string;
  description: string | null;
  isSynthetic: boolean;
  items: StructureItem[];
};

export function CourseStructureSection(props: {
  courseId: string;
  course: {
    status: string;
    hasUnpublishedChanges: boolean;
    coverUrl: string | null;
    thumbnailUrl: string | null;
    modules: StructureModule[];
    items: StructureItem[];
  };
  moduleGroups: StructureGroup[];
  selectedItem: StructureItem | null;
  selectedModule: StructureModule | null;
  selectedItemPreviewHref: string | null;
  presentationPreviewUrls: Map<string, string | null>;
  navigationMode: CourseNavigationMode;
  quizGateMode: CourseQuizGateMode;
  completionMode: CourseCompletionMode;
  statusFormat: CourseStatusFormat;
  gradedItemIds: string[];
  savedMessage?: string;
  errorMessage?: string;
}) {
  const { course, courseId } = props;
  const hasContent = course.modules.length > 0 || course.items.length > 0;
  return (
    <div className="space-y-8">
      <CourseItemActionsAutoClose />
      <SectionIntro
        title="Список материалов"
        description="Соберите курс из разделов и учебных материалов. Изменения в опубликованном курсе сохраняются как черновик до следующей публикации."
        aside={`${course.modules.length} разделов · ${course.items.length} материалов`}
        actions={
          <StructureHeaderActions
            courseId={courseId}
            navigationMode={props.navigationMode}
            quizGateMode={props.quizGateMode}
            completionMode={props.completionMode}
            statusFormat={props.statusFormat}
            gradedItemIds={props.gradedItemIds}
            modules={course.modules}
            items={course.items.map((item) => ({ ...item, moduleTitle: item.module?.title ?? null }))}
          />
        }
      />
      {course.status === "PUBLISHED" && course.hasUnpublishedChanges ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          У курса есть неопубликованные изменения. Ученики пока видят предыдущую опубликованную версию.
        </p>
      ) : null}
      {props.savedMessage ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{props.savedMessage}</p>
      ) : null}
      {props.errorMessage ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{props.errorMessage}</p>
      ) : null}

      {!hasContent ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-8 text-center">
          <p className="text-sm text-zinc-600">Пока нет разделов и материалов. Добавьте первый раздел или учебный материал.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {props.moduleGroups.map((group, moduleIndex) => (
            <section key={group.id ?? `ungrouped-${moduleIndex}`} className="rounded-2xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-200 px-6 py-4">
                <p className="text-xs uppercase tracking-wide text-zinc-400">
                  {group.isSynthetic ? "Без раздела" : `Раздел ${moduleIndex + 1}`}
                </p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  {!group.isSynthetic ? <h2 className="text-2xl font-semibold text-zinc-950">{group.title}</h2> : null}
                  {!group.isSynthetic ? (
                    <Link href={`/courses/${courseId}/manage?section=structure&editModule=${group.id}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50" aria-label="Редактировать раздел" title="Редактировать раздел">
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
                {group.description ? <p className="mt-1 text-sm text-zinc-500">{group.description}</p> : null}
              </div>
              {group.items.length === 0 ? (
                <p className="px-6 py-5 text-sm text-zinc-500">В этом разделе пока нет материалов.</p>
              ) : (
                <div className="px-6 py-2">
                  {group.items.map((item, itemIndex) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl border-b border-zinc-200 px-1 py-2.5 last:border-b-0 hover:bg-zinc-50">
                      <Link href={item.type === "QUIZ" && item.quiz ? `/courses/${courseId}/quiz/${item.quiz.id}/builder` : item.type === "SURVEY" ? `/courses/${courseId}/survey/${item.id}/builder` : `/courses/${courseId}/manage?section=structure&editItem=${item.id}`} className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500">{getItemIcon(item.type)}</div>
                        <div className="min-w-0">
                          <h3 className="truncate text-[15px] font-semibold text-zinc-900">{item.title}</h3>
                          <p className="text-xs text-zinc-500">{getItemTypeLabel(item)}</p>
                        </div>
                      </Link>
                      <details className="relative shrink-0" data-course-item-actions>
                        <summary className="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-transparent text-zinc-500 hover:border-zinc-200 hover:bg-white hover:text-zinc-800" aria-label="Действия с материалом" title="Действия"><MoreVertical className="h-4 w-4" aria-hidden="true" /></summary>
                        <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg">
                          <form action={moveCourseItem.bind(null, courseId, item.id, "up")}><button type="submit" disabled={itemIndex === 0} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"><ArrowUp className="h-4 w-4" aria-hidden="true" />Переместить выше</button></form>
                          <form action={moveCourseItem.bind(null, courseId, item.id, "down")}><button type="submit" disabled={itemIndex === group.items.length - 1} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"><ArrowDown className="h-4 w-4" aria-hidden="true" />Переместить ниже</button></form>
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      {props.selectedItem ? <ItemDialog {...props} item={props.selectedItem} /> : null}
      {props.selectedModule ? <ModuleDialog courseId={courseId} courseModule={props.selectedModule} /> : null}
    </div>
  );
}

function ItemDialog(props: Parameters<typeof CourseStructureSection>[0] & { item: StructureItem }) {
  const { item, courseId, course } = props;
  return (
    <div className="admin-content-modal fixed z-40 flex items-center justify-center bg-zinc-950/40 p-4">
      <CourseModalAutoClose href={`/courses/${courseId}/manage?section=structure`} />
      <Link href={`/courses/${courseId}/manage?section=structure`} aria-label="Закрыть окно редактирования материала" className="absolute inset-0" />
      <div role="dialog" aria-modal="true" aria-labelledby="courseItemDialogTitle" className="relative z-10 max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><p className="text-xs uppercase tracking-wide text-zinc-500">{getItemTypeLabel(item)}</p><h3 id="courseItemDialogTitle" className="text-xl font-semibold text-zinc-950">{item.title}</h3></div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={props.selectedItemPreviewHref ?? `/courses/${courseId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"><Eye className="h-4 w-4" aria-hidden="true" />Предпросмотр</Link>
            <Link href={`/courses/${courseId}/manage?section=structure`} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">Закрыть</Link>
          </div>
        </div>
        <form action={updateCourseItem.bind(null, courseId, item.id)} className="grid gap-3 md:grid-cols-2">
          <input name="title" defaultValue={item.title} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2" />
          <select name="moduleId" defaultValue={item.moduleId ?? ""} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"><option value="">Без раздела</option>{course.modules.map((courseModule) => <option key={courseModule.id} value={courseModule.id}>{courseModule.title}</option>)}</select>
          {item.type === "TEXT" ? <div className="md:col-span-2"><RichTextEditorField name="content" label="Содержание материала" initialValue={item.content ?? ""} placeholder="Обновите текст, форматирование и ссылки" /></div> : item.type === "PDF" ? <div className="md:col-span-2"><CourseItemPresentationFields initialFileUrl={item.fileUrl ?? ""} initialSlides={item.totalSlides} initialPreviewUrl={props.presentationPreviewUrls.get(item.id) ?? null} initialPresentationViewMode={item.presentationViewMode} initialCoverUrl={course.coverUrl} initialThumbnailUrl={course.thumbnailUrl} coverInputName="courseCoverUrl" thumbnailInputName="courseThumbnailUrl" /></div> : item.type === "VIDEO" ? <div className="md:col-span-2"><FileUrlInput name="fileUrl" label="Видео" hint="Поддерживаемые форматы: MP4, WebM" accept=".mp4,.webm,video/mp4,video/webm" initialValue={item.fileUrl ?? ""} /></div> : null}
          <select name="isRequired" defaultValue={item.isRequired ? "1" : "0"} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"><option value="1">Обязательный материал</option><option value="0">Необязательный материал</option></select>
          <div className="flex items-center gap-3"><button type="submit" className="rounded-xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50">Сохранить материал</button></div>
        </form>
        <form action={deleteCourseItem.bind(null, courseId, item.id)} className="mt-3"><button type="submit" className="text-sm text-red-600 underline">Удалить материал</button></form>
        {item.type === "QUIZ" && item.quiz ? <BuilderLink href={`/courses/${courseId}/quiz/${item.quiz.id}/builder`} label="Открыть конструктор теста" /> : item.type === "SURVEY" ? <BuilderLink href={`/courses/${courseId}/survey/${item.id}/builder`} label="Открыть конструктор опроса" /> : null}
      </div>
    </div>
  );
}

function ModuleDialog({ courseId, courseModule }: { courseId: string; courseModule: StructureModule }) {
  return <div className="admin-content-modal fixed z-40 flex items-center justify-center bg-zinc-950/40 p-4"><CourseModalAutoClose href={`/courses/${courseId}/manage?section=structure`} /><Link href={`/courses/${courseId}/manage?section=structure`} aria-label="Закрыть окно редактирования раздела" className="absolute inset-0" /><div role="dialog" aria-modal="true" aria-labelledby="courseModuleDialogTitle" className="relative z-10 w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-zinc-500">Раздел</p><h3 id="courseModuleDialogTitle" className="text-xl font-semibold text-zinc-950">{courseModule.title}</h3></div><Link href={`/courses/${courseId}/manage?section=structure`} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">Закрыть</Link></div><form action={updateCourseModule.bind(null, courseId, courseModule.id)} className="grid gap-3"><input name="title" defaultValue={courseModule.title} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2" /><textarea name="description" rows={3} defaultValue={courseModule.description ?? ""} placeholder="Описание раздела" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2" /><div><button type="submit" className="rounded-xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50">Сохранить раздел</button></div></form><form action={deleteCourseModule.bind(null, courseId, courseModule.id)} className="mt-3"><button type="submit" className="text-sm text-red-600 underline">Удалить раздел</button></form></div></div>;
}

function BuilderLink({ href, label }: { href: string; label: string }) {
  return <div className="mt-6 space-y-6 border-t border-zinc-100 pt-6"><Link href={href} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">{label}</Link></div>;
}

function StructureHeaderActions(props: {
  courseId: string;
  navigationMode: CourseNavigationMode;
  quizGateMode: CourseQuizGateMode;
  completionMode: CourseCompletionMode;
  statusFormat: CourseStatusFormat;
  gradedItemIds: string[];
  modules: Array<{ id: string; title: string }>;
  items: Array<StructureItem & { moduleTitle: string | null }>;
}) {
  return <div className="relative flex flex-wrap items-center justify-end gap-3"><CoursePassingSettingsDialog courseId={props.courseId} navigationMode={props.navigationMode} quizGateMode={props.quizGateMode} completionMode={props.completionMode} statusFormat={props.statusFormat} gradedItemIds={props.gradedItemIds} items={props.items.map((item) => ({ id: item.id, title: item.title, type: item.type, typeLabel: getItemTypeLabel(item), moduleTitle: item.moduleTitle, isRequired: item.isRequired }))} /><CourseStructureAddMenu courseId={props.courseId} modules={props.modules} /></div>;
}

function SectionIntro({ title, description, aside, actions }: { title: string; description: string; aside: string; actions: ReactNode }) {
  return <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold text-zinc-950">{title}</h2><div className="flex flex-wrap items-center justify-start gap-3 sm:justify-end"><span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-600">{aside}</span>{actions}</div></div><p className="max-w-3xl text-sm text-zinc-600">{description}</p></div>;
}

function getItemIcon(type: string) {
  if (type === "QUIZ") return <ClipboardCheck className="h-4 w-4" aria-hidden="true" />;
  if (type === "SURVEY") return <ClipboardList className="h-4 w-4" aria-hidden="true" />;
  if (type === "PDF") return <Files className="h-4 w-4" aria-hidden="true" />;
  if (type === "VIDEO") return <Film className="h-4 w-4" aria-hidden="true" />;
  return <FileText className="h-4 w-4" aria-hidden="true" />;
}

function getItemTypeLabel(item: { type: string; fileUrl?: string | null; presentationViewMode?: string | null }) {
  if (item.type !== "PDF") return COURSE_ITEM_LABELS[item.type as keyof typeof COURSE_ITEM_LABELS] ?? item.type;
  if (!item.fileUrl || !/\.pptx(?:[?#]|$)/i.test(item.fileUrl)) return "PDF";
  return normalizePresentationViewMode(item.presentationViewMode) === "PPTX_HTML5" ? "PPTX · HTML5" : "PPTX · PDF-превью";
}
