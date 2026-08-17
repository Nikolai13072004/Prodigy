"use client";

import { ClipboardList, FileText, ListPlus, Plus, Upload } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { createCourseItem, createCourseModule } from "@/app/actions/course-content-actions";
import {
  CourseItemCreateFields,
  type CourseItemType,
} from "@/app/courses/[id]/manage/CourseItemCreateFields";

type CourseStructureAddMenuProps = {
  courseId: string;
  modules: Array<{ id: string; title: string }>;
};

type AddMode = "module" | CourseItemType | "upload";

const UPLOAD_ACCEPT =
  ".pdf,.pptx,.mp4,.webm,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,video/mp4,video/webm";
const modeButtonBase =
  "w-full rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-500";

const MATERIAL_LABELS: Record<CourseItemType, string> = {
  TEXT: "Страница",
  PDF: "Презентация PDF/PPTX",
  VIDEO: "Видео",
  QUIZ: "Тест",
  SURVEY: "Опрос",
};

const MATERIAL_DESCRIPTIONS: Record<CourseItemType, string> = {
  TEXT: "Текст, ссылки, списки и пояснения для ученика.",
  PDF: "PDF или PPTX с автоматическим подсчетом слайдов.",
  VIDEO: "MP4 или WebM для видеоматериала.",
  QUIZ: "Пустой тест, вопросы добавляются в конструкторе.",
  SURVEY: "Опрос с титульным листом, вариантами ответов и отчетом автору.",
};

type UploadApiResult = {
  url?: string;
  previewUrl?: string | null;
  html5Url?: string | null;
  pages?: number | null;
  error?: string;
};

function getUploadedMaterialType(file: File): "PDF" | "VIDEO" | null {
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith(".pdf") || fileName.endsWith(".pptx")) return "PDF";
  if (fileName.endsWith(".mp4") || fileName.endsWith(".webm")) return "VIDEO";
  if (file.type === "application/pdf" || file.type.includes("presentation")) return "PDF";
  if (file.type.startsWith("video/")) return "VIDEO";
  return null;
}

function getUploadedMaterialTitle(fileName: string) {
  const normalized = fileName.trim().replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return normalized || "Загруженный материал";
}

async function parseUploadResponse(response: Response) {
  const raw = await response.text();
  if (!raw) return {} as UploadApiResult;

  try {
    return JSON.parse(raw) as UploadApiResult;
  } catch {
    return {
      error: `Сервер вернул некорректный ответ (${response.status}). Попробуйте загрузить файл еще раз.`,
    };
  }
}

function hasMeaningfulRichTextValue(value: FormDataEntryValue | null) {
  const html = typeof value === "string" ? value : "";
  const container = document.createElement("div");
  container.innerHTML = html;
  return Boolean((container.textContent ?? "").replace(/\u00a0/g, " ").trim());
}

export function CourseStructureAddMenu({ courseId, modules }: CourseStructureAddMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<AddMode | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const uploadTitleRef = useRef<HTMLInputElement>(null);
  const uploadTypeRef = useRef<HTMLInputElement>(null);
  const uploadModuleRef = useRef<HTMLInputElement>(null);
  const uploadFileUrlRef = useRef<HTMLInputElement>(null);
  const uploadTotalSlidesRef = useRef<HTMLInputElement>(null);
  const uploadPresentationViewModeRef = useRef<HTMLInputElement>(null);

  const closePanel = useCallback(() => {
    if (uploadBusy) return;
    setIsOpen(false);
    setActiveMode(null);
    setFormError(null);
    setUploadError(null);
  }, [uploadBusy]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !uploadBusy) {
        closePanel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closePanel, isOpen, uploadBusy]);

  function openPanel(mode: AddMode | null = null) {
    setIsOpen(true);
    setActiveMode(mode);
    setFormError(null);
    setUploadError(null);
  }

  function selectMode(mode: AddMode) {
    setActiveMode(mode);
    setFormError(null);
    setUploadError(null);
  }

  function keepMaterialFormOpenWithError(message: string) {
    setIsOpen(true);
    setFormError(message);
  }

  function handleMaterialFormSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const type = String(formData.get("type") ?? "");

    setFormError(null);

    if (type === "TEXT" && !hasMeaningfulRichTextValue(formData.get("content"))) {
      event.preventDefault();
      keepMaterialFormOpenWithError("Для страницы заполните содержание или выберите другой тип материала.");
      return;
    }

    if ((type === "PDF" || type === "VIDEO") && !String(formData.get("fileUrl") ?? "").trim()) {
      event.preventDefault();
      keepMaterialFormOpenWithError("Для презентации или видео загрузите файл в форме ниже.");
      return;
    }

    if (type === "PDF" && !String(formData.get("totalSlides") ?? "").trim()) {
      event.preventDefault();
      keepMaterialFormOpenWithError("Не удалось определить количество слайдов. Загрузите PDF/PPTX еще раз.");
    }
  }

  async function handleUploadFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const materialType = getUploadedMaterialType(file);
    if (!materialType) {
      setUploadError("Поддерживаются только PDF, PPTX, MP4 и WebM.");
      setActiveMode("upload");
      event.target.value = "";
      return;
    }

    setIsOpen(true);
    setActiveMode("upload");
    setUploadBusy(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const payload = await parseUploadResponse(response);

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Не удалось загрузить файл.");
      }

      if (materialType === "PDF" && (!payload.pages || payload.pages < 1)) {
        throw new Error("Не удалось определить количество слайдов. Проверьте PDF/PPTX и попробуйте снова.");
      }

      if (
        !uploadFormRef.current ||
        !uploadTitleRef.current ||
        !uploadTypeRef.current ||
        !uploadModuleRef.current ||
        !uploadFileUrlRef.current ||
        !uploadTotalSlidesRef.current ||
        !uploadPresentationViewModeRef.current
      ) {
        throw new Error("Не удалось подготовить форму добавления материала.");
      }

      uploadTitleRef.current.value = getUploadedMaterialTitle(file.name);
      uploadTypeRef.current.value = materialType;
      uploadModuleRef.current.value = modules[0]?.id ?? "";
      uploadFileUrlRef.current.value = payload.url;
      uploadTotalSlidesRef.current.value = materialType === "PDF" ? String(payload.pages) : "";
      const isPptxUpload = /\.pptx(\?|#|$)/i.test(payload.url) || /\.pptx$/i.test(file.name);
      uploadPresentationViewModeRef.current.value =
        materialType === "PDF" && isPptxUpload && payload.html5Url ? "PPTX_HTML5" : "PDF_PREVIEW";
      uploadFormRef.current.requestSubmit();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Не удалось загрузить файл.");
      setUploadBusy(false);
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => openPanel()}
        className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
      >
        <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2.4} />
        Добавить
      </button>

      {isOpen ? (
        <div className="admin-content-modal fixed z-40 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Закрыть окно добавления"
            className="absolute inset-0 bg-zinc-950/30 backdrop-blur-[1px]"
            onClick={closePanel}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-add-panel-title"
            className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
          >
            <div className="border-b border-zinc-200 bg-gradient-to-br from-emerald-50 via-white to-blue-50 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Конструктор курса
                  </p>
                  <h2 id="course-add-panel-title" className="mt-2 text-2xl font-semibold text-zinc-950">
                    Добавить в курс
                  </h2>
                  <p className="mt-2 max-w-xl text-sm text-zinc-600">
                    Сначала выберите, что именно добавляем. Форма не закроется при локальной ошибке,
                    чтобы не терять введенные данные.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closePanel}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Закрыть
                </button>
              </div>
            </div>

            <div className="grid flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[240px_1fr]">
              <div className="space-y-3">
                <ModeButton
                  active={activeMode === "module"}
                  title="Раздел"
                  description="Группа для материалов курса."
                  icon={<ListPlus aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />}
                  onClick={() => selectMode("module")}
                />
                <ModeButton
                  active={activeMode === "TEXT"}
                  title="Страница"
                  description={MATERIAL_DESCRIPTIONS.TEXT}
                  icon={<FileText aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />}
                  onClick={() => selectMode("TEXT")}
                />
                <ModeButton
                  active={activeMode === "PDF"}
                  title="Презентация"
                  description={MATERIAL_DESCRIPTIONS.PDF}
                  icon={<Upload aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />}
                  onClick={() => selectMode("PDF")}
                />
                <ModeButton
                  active={activeMode === "VIDEO"}
                  title="Видео"
                  description={MATERIAL_DESCRIPTIONS.VIDEO}
                  icon={<Upload aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />}
                  onClick={() => selectMode("VIDEO")}
                />
                <ModeButton
                  active={activeMode === "QUIZ"}
                  title="Тест"
                  description={MATERIAL_DESCRIPTIONS.QUIZ}
                  icon={<FileText aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />}
                  onClick={() => selectMode("QUIZ")}
                />
                <ModeButton
                  active={activeMode === "SURVEY"}
                  title="Опрос"
                  description={MATERIAL_DESCRIPTIONS.SURVEY}
                  icon={<ClipboardList aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />}
                  onClick={() => selectMode("SURVEY")}
                />
                <ModeButton
                  active={activeMode === "upload"}
                  title="Быстро загрузить файл"
                  description="Автоматически создать презентацию или видео из файла."
                  icon={<Upload aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />}
                  onClick={() => selectMode("upload")}
                />
              </div>

              <div className="min-w-0">
                {!activeMode ? (
                  <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
                    Выберите слева тип элемента. Для презентаций и видео можно использовать обычную форму
                    или быстрый режим загрузки файла.
                  </div>
                ) : null}

                {activeMode === "module" ? (
                  <form action={createCourseModule.bind(null, courseId)} className="space-y-4 rounded-3xl border border-zinc-200 p-5">
                    <div>
                      <label className="block text-sm font-medium text-zinc-900">Название раздела</label>
                      <input
                        name="title"
                        defaultValue="Новый раздел"
                        required
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-900">Описание</label>
                      <textarea
                        name="description"
                        rows={4}
                        placeholder="Коротко опишите, что будет внутри раздела"
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Добавить раздел
                    </button>
                  </form>
                ) : null}

                {activeMode && activeMode !== "module" && activeMode !== "upload" ? (
                  <form
                    action={createCourseItem.bind(null, courseId)}
                    className="space-y-4 rounded-3xl border border-zinc-200 p-5"
                    onChange={() => {
                      if (formError) setFormError(null);
                    }}
                    onSubmit={handleMaterialFormSubmit}
                  >
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                      <p className="font-medium">{MATERIAL_LABELS[activeMode]}</p>
                      <p className="mt-1 text-xs text-blue-800">{MATERIAL_DESCRIPTIONS[activeMode]}</p>
                    </div>
                    {formError ? (
                      <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {formError}
                      </p>
                    ) : null}
                    <input
                      name="title"
                      placeholder="Название материала"
                      required
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
                    />
                    <ModuleSelect modules={modules} />
                    <CourseItemCreateFields
                      key={activeMode}
                      allowedTypes={[activeMode]}
                      initialType={activeMode}
                      showTypeSelect={false}
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Добавить материал
                    </button>
                  </form>
                ) : null}

                {activeMode === "upload" ? (
                  <div className="space-y-4 rounded-3xl border border-zinc-200 p-5">
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      <p className="font-medium">Быстрая загрузка</p>
                      <p className="mt-1 text-xs text-emerald-800">
                        Выберите PDF/PPTX, MP4 или WebM. Материал будет создан автоматически в первом разделе курса.
                      </p>
                    </div>
                    {uploadError ? (
                      <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {uploadError}
                      </p>
                    ) : null}
                    {uploadBusy ? (
                      <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                        Загружаю и подготавливаю материал...
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      disabled={uploadBusy}
                      className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Выбрать файл
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <input
        ref={uploadInputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        disabled={uploadBusy}
        onChange={handleUploadFileChange}
      />
      <form ref={uploadFormRef} action={createCourseItem.bind(null, courseId)} className="hidden">
        <input ref={uploadTitleRef} type="hidden" name="title" defaultValue="" />
        <input ref={uploadTypeRef} type="hidden" name="type" defaultValue="" />
        <input ref={uploadModuleRef} type="hidden" name="moduleId" defaultValue="" />
        <input ref={uploadFileUrlRef} type="hidden" name="fileUrl" defaultValue="" />
        <input ref={uploadTotalSlidesRef} type="hidden" name="totalSlides" defaultValue="" />
        <input ref={uploadPresentationViewModeRef} type="hidden" name="presentationViewMode" defaultValue="PDF_PREVIEW" />
        <input type="hidden" name="isRequired" defaultValue="1" />
      </form>
    </div>
  );
}

function ModeButton({
  active,
  title,
  description,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${modeButtonBase} ${
        active
          ? "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm"
          : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </span>
      <span className="mt-2 block text-xs leading-relaxed text-zinc-500">{description}</span>
    </button>
  );
}

function ModuleSelect({ modules }: { modules: Array<{ id: string; title: string }> }) {
  return (
    <select
      name="moduleId"
      defaultValue={modules[0]?.id ?? ""}
      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
    >
      <option value="">Без раздела</option>
      {modules.map((module) => (
        <option key={module.id} value={module.id}>
          {module.title}
        </option>
      ))}
    </select>
  );
}
