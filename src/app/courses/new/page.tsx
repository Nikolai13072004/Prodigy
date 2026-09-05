import Link from "next/link";
import {
  copyCourse,
  createCourse,
  createCourseFromPresentation,
  createCourseFromTemplate,
} from "@/app/actions/course-creation-actions";
import { CourseCoverInput } from "@/components/CourseCoverInput";
import { PresentationCourseAssetsFields } from "@/components/PresentationCourseAssetsFields";
import { Select } from "@/components/ui";
import {
  COURSE_CREATION_MODE_OPTIONS,
  COURSE_TEMPLATE_OPTIONS,
  getCourseCreationMode,
} from "@/lib/course-creation-options";
import {
  COURSE_CATEGORY_OPTIONS,
  COURSE_DIFFICULTY_OPTIONS,
} from "@/lib/course-metadata";
import { requireAdmin } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";

type SearchParams = {
  mode?: string;
  error?: string;
  title?: string;
  description?: string;
  category?: string;
  difficultyLevel?: string;
  durationHours?: string;
  durationMinutes?: string;
  coverUrl?: string;
  moduleTitle?: string;
  presentationTitle?: string;
  fileUrl?: string;
  totalSlides?: string;
  presentationPreviewUrl?: string;
  presentationViewMode?: string;
  includeQuiz?: string;
  templateKey?: string;
  sourceCourseId?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

export default async function NewCoursePage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const mode = getCourseCreationMode(sp.mode);
  const sourceCourses = await prisma.course.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      _count: {
        select: {
          modules: true,
          items: true,
        },
      },
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link
        href="/courses"
        className="text-sm text-[var(--ink-muted)] underline hover:text-[var(--ink)]"
      >
        ← К списку курсов
      </Link>

      <div className="mt-6 max-w-2xl">
        <h1 className="text-2xl font-semibold">Новый курс</h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Начните с рабочего материала. Остальную структуру можно настроить после создания.
        </p>
      </div>

      <nav className="mt-6 grid gap-3 md:grid-cols-4" aria-label="Способ создания курса">
        {COURSE_CREATION_MODE_OPTIONS.map((option) => (
          <ModeLink
            key={option.value}
            href={`/courses/new?mode=${option.value}`}
            label={option.label}
            description={option.description}
            active={mode === option.value}
          />
        ))}
      </nav>

      {sp.error ? (
        <p className="mt-6 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {sp.error}
        </p>
      ) : null}

      {mode === "presentation" ? (
        <PresentationCourseForm sp={sp} />
      ) : mode === "template" ? (
        <TemplateCourseForm sp={sp} />
      ) : mode === "copy" ? (
        <CopyCourseForm sp={sp} sourceCourses={sourceCourses} />
      ) : (
        <BlankCourseForm sp={sp} />
      )}
    </main>
  );
}

function ModeLink({
  href,
  label,
  description,
  active,
}: {
  href: string;
  label: string;
  description: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-xl border px-4 py-3 text-left text-sm transition",
        active
          ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm"
          : "border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--line)]",
      ].join(" ")}
    >
      <span className="block font-medium">{label}</span>
      <span className={active ? "mt-1 block text-xs text-white/80" : "mt-1 block text-xs text-[var(--ink-muted)]"}>
        {description}
      </span>
    </Link>
  );
}

function BlankCourseForm({ sp }: { sp: SearchParams }) {
  return (
    <form action={createCourse} className="mt-8 space-y-6">
      <CourseBasicsFields sp={sp} />
      <AdditionalCourseFields sp={sp} />
      <SubmitRow
        label="Создать курс"
        hint="После создания откроется workspace курса с модулями, уроками и публикацией."
      />
    </form>
  );
}

function PresentationCourseForm({ sp }: { sp: SearchParams }) {
  const slides = parseInitialSlides(sp.totalSlides);

  return (
    <form action={createCourseFromPresentation} className="mt-8 space-y-6">
      <section className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Курс из презентации</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="title" className="block text-sm font-medium text-[var(--ink)]">
              Название курса
            </label>
            <input
              id="title"
              name="title"
              required
              defaultValue={sp.title ?? ""}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="description" className="block text-sm font-medium text-[var(--ink)]">
              Описание
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              required
              defaultValue={sp.description ?? ""}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <PresentationCourseAssetsFields
              initialFileUrl={sp.fileUrl ?? null}
              initialSlides={slides}
              initialPreviewUrl={sp.presentationPreviewUrl ?? null}
              initialPresentationViewMode={sp.presentationViewMode ?? null}
              initialCoverUrl={sp.coverUrl ?? null}
            />
          </div>
          <label className="md:col-span-2 flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)]">
            <input type="hidden" name="includeQuiz" value="0" />
            <input
              type="checkbox"
              name="includeQuiz"
              value="1"
              defaultChecked={sp.includeQuiz !== "0"}
              className="mt-1"
            />
            <span>Добавить после презентации пустой итоговый тест</span>
          </label>
        </div>
      </section>
      <AdditionalCourseFields sp={sp} showCoverInput={false} />
      <SubmitRow
        label="Создать курс"
        hint="Если тест включен, после создания откроется конструктор вопросов."
      />
    </form>
  );
}

function TemplateCourseForm({ sp }: { sp: SearchParams }) {
  return (
    <form action={createCourseFromTemplate} className="mt-8 space-y-6">
      <section className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Шаблон</h2>
        <div className="mt-5">
          <label htmlFor="templateKey" className="block text-sm font-medium text-[var(--ink)]">
            Тип структуры
          </label>
          <Select
            id="templateKey"
            name="templateKey"
            defaultValue={sp.templateKey ?? COURSE_TEMPLATE_OPTIONS[0].value}
            className="mt-1 w-full"
          >
            {COURSE_TEMPLATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.description}
              </option>
            ))}
          </Select>
        </div>
      </section>
      <CourseBasicsFields sp={sp} />
      <AdditionalCourseFields sp={sp} />
      <SubmitRow
        label="Создать по шаблону"
        hint="После создания можно заменить названия, материалы и вопросы тестов."
      />
    </form>
  );
}

function CopyCourseForm({
  sp,
  sourceCourses,
}: {
  sp: SearchParams;
  sourceCourses: Array<{
    id: string;
    title: string;
    _count: { modules: number; items: number };
  }>;
}) {
  return (
    <form action={copyCourse} className="mt-8 space-y-6">
      <section className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Исходный курс</h2>
        <div className="mt-5 grid gap-4">
          <div>
            <label htmlFor="sourceCourseId" className="block text-sm font-medium text-[var(--ink)]">
              Курс для копирования
            </label>
            <Select
              id="sourceCourseId"
              name="sourceCourseId"
              required
              defaultValue={sp.sourceCourseId ?? ""}
              className="mt-1 w-full"
            >
              <option value="">Выберите курс</option>
              {sourceCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title} · {course._count.modules} мод. · {course._count.items} ур.
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="copyTitle" className="block text-sm font-medium text-[var(--ink)]">
              Название нового курса
            </label>
            <input
              id="copyTitle"
              name="title"
              defaultValue={sp.title ?? ""}
              placeholder="Если оставить пустым, добавится «— копия»"
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="copyDescription" className="block text-sm font-medium text-[var(--ink)]">
              Описание нового курса
            </label>
            <textarea
              id="copyDescription"
              name="description"
              rows={4}
              defaultValue={sp.description ?? ""}
              placeholder="Если оставить пустым, скопируется описание исходного курса"
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>
      <SubmitRow
        label="Скопировать курс"
        hint="Копируются модули, уроки, презентации и вопросы тестов. Назначения и попытки не копируются."
      />
    </form>
  );
}

function CourseBasicsFields({ sp }: { sp: SearchParams }) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-[var(--ink)]">Карточка курса</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor="title" className="block text-sm font-medium text-[var(--ink)]">
            Название
          </label>
          <input
            id="title"
            name="title"
            required
            defaultValue={sp.title ?? ""}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="description" className="block text-sm font-medium text-[var(--ink)]">
            Описание
          </label>
          <textarea
            id="description"
            name="description"
            rows={5}
            required
            defaultValue={sp.description ?? ""}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>
    </section>
  );
}

function AdditionalCourseFields({
  sp,
  showCoverInput = true,
}: {
  sp: SearchParams;
  showCoverInput?: boolean;
}) {
  return (
    <details className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm">
      <summary className="cursor-pointer text-sm font-medium text-[var(--ink)]">
        Дополнительно
      </summary>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-[var(--ink)]">
            Категория
          </label>
          <Select
            id="category"
            name="category"
            defaultValue={sp.category ?? ""}
            className="mt-1 w-full"
          >
            <option value="">Не выбрана</option>
            {COURSE_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label htmlFor="difficultyLevel" className="block text-sm font-medium text-[var(--ink)]">
            Уровень сложности
          </label>
          <Select
            id="difficultyLevel"
            name="difficultyLevel"
            defaultValue={sp.difficultyLevel ?? ""}
            className="mt-1 w-full"
          >
            <option value="">Не выбран</option>
            {COURSE_DIFFICULTY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label htmlFor="durationHours" className="block text-sm font-medium text-[var(--ink)]">
            Длительность, часы
          </label>
          <input
            id="durationHours"
            name="durationHours"
            type="number"
            min={0}
            max={999}
            defaultValue={sp.durationHours ?? ""}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="durationMinutes" className="block text-sm font-medium text-[var(--ink)]">
            Длительность, минуты
          </label>
          <input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={0}
            max={59}
            defaultValue={sp.durationMinutes ?? ""}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
          />
        </div>
        {showCoverInput ? (
          <div className="md:col-span-2">
            <CourseCoverInput initialValue={sp.coverUrl ?? null} />
          </div>
        ) : null}
      </div>
    </details>
  );
}

function SubmitRow({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
      >
        {label}
      </button>
      <p className="text-sm text-[var(--ink-muted)]">{hint}</p>
    </div>
  );
}

function parseInitialSlides(value: string | undefined) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
