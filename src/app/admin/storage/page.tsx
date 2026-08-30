import Link from "next/link";
import {
  deleteMissingStorageFileRecords,
  deleteOrphanStorageFiles,
  deleteStorageFile,
} from "@/app/actions/storage-actions";
import { Badge, Button, Input, Select } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { type StorageCategoryKey, getStorageOverview } from "@/lib/storage-overview";

type Props = {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    file?: string;
    q?: string;
    category?: string;
    area?: string;
  }>;
};

type StorageAreaFilter = "all" | "uploads" | "branding";
type StorageCategoryFilter = "all" | StorageCategoryKey;

type StorageFilterState = {
  q: string;
  category: StorageCategoryFilter;
  area: StorageAreaFilter;
};

const CATEGORY_OPTIONS = [
  { value: "all", label: "Все типы" },
  { value: "video", label: "Видео" },
  { value: "image", label: "Изображения" },
  { value: "other", label: "Прочее" },
] as const;

const AREA_OPTIONS = [
  { value: "all", label: "Все зоны" },
  { value: "uploads", label: "Учебные загрузки" },
  { value: "branding", label: "Брендинг платформы" },
] as const;

const VALID_CATEGORY_VALUES = new Set<string>(CATEGORY_OPTIONS.map((option) => option.value));
const VALID_AREA_VALUES = new Set<string>(AREA_OPTIONS.map((option) => option.value));

function formatBytes(value: number) {
  if (value < 1024) return `${value} Б`;

  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const maximumFractionDigits = size >= 10 ? 0 : 1;
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(size) + ` ${units[unitIndex]}`;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm">
      <p className="text-sm font-medium text-[var(--ink-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)]">{value}</p>
      <p className="mt-2 text-xs text-[var(--ink-muted)]">{hint}</p>
    </div>
  );
}

function buildStoragePageHref(filters: StorageFilterState, options?: { file?: string | null }) {
  const params = new URLSearchParams();

  if (filters.q) {
    params.set("q", filters.q);
  }
  if (filters.category !== "all") {
    params.set("category", filters.category);
  }
  if (filters.area !== "all") {
    params.set("area", filters.area);
  }
  if (options?.file) {
    params.set("file", options.file);
  }

  const query = params.toString();
  return query ? `/admin/storage?${query}` : "/admin/storage";
}

function HiddenReturnFields({
  filters,
  selectedFileUrl,
}: {
  filters: StorageFilterState;
  selectedFileUrl?: string | null;
}) {
  return (
    <>
      <input type="hidden" name="returnQ" value={filters.q} />
      <input type="hidden" name="returnCategory" value={filters.category} />
      <input type="hidden" name="returnArea" value={filters.area} />
      <input type="hidden" name="returnFile" value={selectedFileUrl ?? ""} />
    </>
  );
}

function DeleteStorageFileForm({
  url,
  filters,
  selectedFileUrl,
}: {
  url: string;
  filters: StorageFilterState;
  selectedFileUrl?: string | null;
}) {
  return (
    <form action={deleteStorageFile}>
      <input type="hidden" name="url" value={url} />
      <HiddenReturnFields filters={filters} selectedFileUrl={selectedFileUrl} />
      <button
        type="submit"
        className="rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] hover:opacity-90"
      >
        Удалить
      </button>
    </form>
  );
}

function normalizeFilterState(searchParams: Awaited<Props["searchParams"]>): StorageFilterState {
  return {
    q: (searchParams.q ?? "").trim(),
    category: VALID_CATEGORY_VALUES.has(searchParams.category ?? "")
      ? (searchParams.category as StorageCategoryFilter)
      : "all",
    area: VALID_AREA_VALUES.has(searchParams.area ?? "")
      ? (searchParams.area as StorageAreaFilter)
      : "all",
  };
}

function matchesFilter(
  file: {
    fileName: string;
    relativePath: string;
    category: StorageCategoryKey;
    storageArea: "uploads" | "branding";
  },
  filters: StorageFilterState
) {
  if (filters.category !== "all" && file.category !== filters.category) {
    return false;
  }
  if (filters.area !== "all" && file.storageArea !== filters.area) {
    return false;
  }
  if (!filters.q) {
    return true;
  }

  const query = filters.q.toLocaleLowerCase("ru");
  return (
    file.fileName.toLocaleLowerCase("ru").includes(query) ||
    file.relativePath.toLocaleLowerCase("ru").includes(query)
  );
}

function hasActiveFilters(filters: StorageFilterState) {
  return Boolean(filters.q) || filters.category !== "all" || filters.area !== "all";
}

export default async function AdminStoragePage({ searchParams }: Props) {
  await requirePlatformAdmin();
  const [overview, sp] = await Promise.all([getStorageOverview(), searchParams]);
  const filters = normalizeFilterState(sp);
  const currentFiltersActive = hasActiveFilters(filters);

  const selectedFile = sp.file ? overview.files.find((file) => file.url === sp.file) ?? null : null;
  const filteredFiles = overview.files.filter((file) => matchesFilter(file, filters));
  const filteredOrphanFiles = filteredFiles.filter((file) => !file.isReferenced);
  const filteredReferencedFiles = filteredFiles.filter((file) => file.isReferenced);
  const filteredSizeBytes = filteredFiles.reduce((sum, file) => sum + file.sizeBytes, 0);
  const filteredLargestFiles = filteredFiles.slice(0, 20);

  return (
    <main className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Хранилище файлов</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">
            Обзор загруженных файлов LMS: объём по типам, крупнейшие объекты и безопасная навигация по файлам с
            фильтрацией по имени, типу и зоне хранения.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {overview.summary.metadataOrphanRecords > 0 ? (
            <form action={deleteMissingStorageFileRecords}>
              <HiddenReturnFields filters={filters} selectedFileUrl={selectedFile?.url ?? null} />
              <button
                type="submit"
                className="rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-2 text-sm font-medium text-[var(--warning)] hover:opacity-90"
              >
                Очистить индекс ({overview.summary.metadataOrphanRecords})
              </button>
            </form>
          ) : null}
          {overview.summary.unreferencedFiles > 0 ? (
            <form action={deleteOrphanStorageFiles}>
              <HiddenReturnFields filters={filters} selectedFileUrl={selectedFile?.url ?? null} />
              <button
                type="submit"
                className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-2 text-sm font-medium text-[var(--danger)] hover:opacity-90"
              >
                Очистить сиротские файлы ({overview.summary.unreferencedFiles})
              </button>
            </form>
          ) : null}
          <Link
            href="/admin/settings?tab=general"
            className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
          >
            Брендинг
          </Link>
          <Link
            href="/courses"
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
          >
            Курсы
          </Link>
        </div>
      </div>

      {sp.notice ? (
        <div className="mt-4 rounded-2xl border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
          {sp.notice}
        </div>
      ) : null}
      {sp.error ? (
        <div className="mt-4 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {sp.error}
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-[var(--info)] bg-[var(--info-soft)] px-4 py-3 text-sm text-[var(--info)]">
        В обзор входят файлы из `data/uploads` и `public/branding`. Встроенные статические ассеты и демо-файлы вне
        этих папок сюда не попадают.
      </div>

      {overview.summary.metadataOrphanRecords > 0 ? (
        <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--warning)] bg-[var(--surface-raised)] shadow-sm">
          <div className="border-b border-[var(--warning)] bg-[var(--warning-soft)] px-6 py-4">
            <h2 className="text-lg font-semibold text-[var(--warning)]">Битые записи индекса StorageFile</h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--warning)]">
              Эти записи есть в БД, но соответствующих файлов на диске уже нет. Они не занимают место, но могут мешать
              дедупликации и повторной загрузке.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--line)] text-sm">
              <thead className="bg-[var(--warning-soft)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--warning)]">
                <tr>
                  <th className="px-6 py-3">Запись</th>
                  <th className="px-6 py-3">Зона</th>
                  <th className="px-6 py-3">Размер</th>
                  <th className="px-6 py-3">Последняя фиксация</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {overview.metadataOrphans.slice(0, 20).map((record) => (
                  <tr key={record.id} className="align-top">
                    <td className="px-6 py-4">
                      <div className="font-medium text-[var(--ink)]">{record.fileName}</div>
                      <div className="mt-1 break-all font-mono text-xs text-[var(--ink-muted)]">{record.relativePath}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge tone="warning">{record.storageAreaLabel}</Badge>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-[var(--ink)]">{formatBytes(record.sizeBytes)}</td>
                    <td className="px-6 py-4 text-sm text-[var(--ink-muted)]">{formatDateTime(record.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {overview.metadataOrphans.length > 20 ? (
            <div className="border-t border-[var(--line)] px-6 py-3 text-sm text-[var(--warning)]">
              Показаны первые 20 записей из {overview.metadataOrphans.length}. Очистка удалит весь найденный список.
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedFile ? (
        <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">Зависимости файла</h2>
              <p className="mt-1 max-w-3xl text-sm text-[var(--ink-muted)]">
                Полный список найденных связей для выбранного файла. Это помогает оценить влияние перед отвязкой или
                удалением.
              </p>
            </div>
            <Link
              href={buildStoragePageHref(filters)}
              className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
            >
              Сбросить выбор
            </Link>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-[var(--ink)]">{selectedFile.fileName}</h3>
                <Badge tone={selectedFile.isReferenced ? "success" : "warning"}>
                  {selectedFile.isReferenced ? "Связан с объектами" : "Сиротский файл"}
                </Badge>
                {matchesFilter(selectedFile, filters) ? null : (
                  <Badge tone="info">Вне текущего фильтра</Badge>
                )}
              </div>
              <p className="mt-2 break-all font-mono text-xs text-[var(--ink-muted)]">{selectedFile.relativePath}</p>

              {selectedFile.isReferenced ? (
                <div className="mt-4 rounded-2xl border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning)]">
                  Удаление напрямую сейчас недоступно: файл используется в платформе. Сначала отвяжите его от курса,
                  урока, ответа ученика или настроек брендинга.
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <DeleteStorageFileForm
                    url={selectedFile.url}
                    filters={filters}
                    selectedFileUrl={selectedFile.url}
                  />
                  <a
                    href={selectedFile.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                  >
                    Открыть файл
                  </a>
                </div>
              )}

              <div className="mt-5 space-y-3">
                {selectedFile.usages.length === 0 ? (
                  <p className="text-sm text-[var(--ink-muted)]">
                    Ссылки на этот файл не найдены. Его можно удалить по одной кнопке или через массовую очистку
                    сиротских файлов.
                  </p>
                ) : (
                  selectedFile.usages.map((usage) => (
                    <div key={usage.key} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="success">{usage.label}</Badge>
                        {usage.href ? (
                          <Link href={usage.href} className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-strong)]">
                            Открыть контекст
                          </Link>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-[var(--ink)]">{usage.detail}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
                <h3 className="text-sm font-semibold text-[var(--ink)]">Сводка</h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-[var(--ink-muted)]">Размер</dt>
                    <dd className="mt-1 font-medium text-[var(--ink)]">{formatBytes(selectedFile.sizeBytes)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-muted)]">Зона хранения</dt>
                    <dd className="mt-1 text-[var(--ink)]">{selectedFile.storageAreaLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-muted)]">Тип</dt>
                    <dd className="mt-1 text-[var(--ink)]">
                      {selectedFile.categoryLabel}
                      {selectedFile.extension ? ` · ${selectedFile.extension}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-muted)]">Найдено связей</dt>
                    <dd className="mt-1 text-[var(--ink)]">{selectedFile.usages.length}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
                <h3 className="text-sm font-semibold text-[var(--ink)]">Что делать дальше</h3>
                <p className="mt-3 text-sm text-[var(--ink-muted)]">
                  {selectedFile.isReferenced
                    ? "Если файл больше не нужен, сначала уберите ссылку на него в источнике использования, затем вернитесь в хранилище."
                    : "Файл не используется. Его можно удалять точечно или через массовую очистку сиротских файлов."}
                </p>
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Общий объём"
          value={formatBytes(overview.summary.totalSizeBytes)}
          hint={`${overview.summary.totalFiles} файлов в инвентаре`}
        />
        {overview.categorySummaries.map((summary) => (
          <MetricCard
            key={summary.key}
            label={summary.label}
            value={formatBytes(summary.sizeBytes)}
            hint={`${summary.filesCount} файлов`}
          />
        ))}
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Связано с объектами"
          value={formatBytes(overview.summary.referencedSizeBytes)}
          hint={`${overview.summary.referencedFiles} файлов имеют связь с курсами или настройками`}
        />
        <MetricCard
          label="Без найденных ссылок"
          value={formatBytes(overview.summary.unreferencedSizeBytes)}
          hint={`${overview.summary.unreferencedFiles} файлов можно проверить на актуальность`}
        />
        <MetricCard
          label="Битые записи индекса"
          value={String(overview.summary.metadataOrphanRecords)}
          hint="Записи StorageFile без файла на диске"
        />
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--ink-muted)]">Зоны хранения</p>
          <div className="mt-4 space-y-3">
            {overview.areaSummaries.map((summary) => (
              <div key={summary.key} className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[var(--ink)]">{summary.label}</div>
                  <div className="text-xs text-[var(--ink-muted)]">{summary.filesCount} файлов</div>
                </div>
                <div className="text-sm font-semibold text-[var(--ink)]">{formatBytes(summary.sizeBytes)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Поиск и фильтры</h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--ink-muted)]">
              Отбирайте файлы по имени или пути, типу контента и зоне хранения. Все действия ниже сохраняют выбранный
              срез.
            </p>
          </div>

          {currentFiltersActive ? (
            <Link
              href="/admin/storage"
              className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
            >
              Сбросить фильтры
            </Link>
          ) : null}
        </div>

        <form method="get" className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_220px_220px_auto]">
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">Имя или путь файла</span>
            <Input
              type="search"
              name="q"
              defaultValue={filters.q}
              placeholder="Например: intro, cover, quiz-attachments"
              className="mt-2"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">Тип</span>
            <Select name="category" defaultValue={filters.category} className="mt-2">
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">Зона</span>
            <Select name="area" defaultValue={filters.area} className="mt-2">
              {AREA_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <div className="flex items-end gap-3">
            <Button type="submit">Применить</Button>
          </div>
        </form>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Найдено файлов: {filteredFiles.length}</Badge>
          <Badge tone="neutral">Объём среза: {formatBytes(filteredSizeBytes)}</Badge>
          <Badge tone="success">Со ссылками: {filteredReferencedFiles.length}</Badge>
          <Badge tone="warning">Сиротские: {filteredOrphanFiles.length}</Badge>
          {filters.q ? <Badge tone="info">Поиск: {filters.q}</Badge> : null}
          {filters.category !== "all" ? (
            <Badge tone="info">
              Тип: {CATEGORY_OPTIONS.find((option) => option.value === filters.category)?.label}
            </Badge>
          ) : null}
          {filters.area !== "all" ? (
            <Badge tone="info">Зона: {AREA_OPTIONS.find((option) => option.value === filters.area)?.label}</Badge>
          ) : null}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-sm">
        <div className="border-b border-[var(--line)] bg-[var(--surface)] px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Инвентарь файлов</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Полный список файлов в текущем срезе. Из него удобно быстро открыть зависимость, найти сиротский файл или
            проверить конкретную папку.
          </p>
        </div>

        {filteredFiles.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-medium text-[var(--ink)]">По текущему фильтру файлы не найдены.</p>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Измените поисковый запрос или сбросьте фильтры, чтобы вернуться ко всему инвентарю.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--line)] text-sm">
              <thead className="bg-[var(--surface)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <tr>
                  <th className="px-6 py-3">Файл</th>
                  <th className="px-6 py-3">Зона и тип</th>
                  <th className="px-6 py-3">Размер</th>
                  <th className="px-6 py-3">Связи</th>
                  <th className="px-6 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {filteredFiles.map((file) => (
                  <tr key={file.url} className="align-top">
                    <td className="px-6 py-4">
                      <div className="font-medium text-[var(--ink)]">{file.fileName}</div>
                      <div className="mt-1 break-all font-mono text-xs text-[var(--ink-muted)]">{file.relativePath}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone="neutral">{file.storageAreaLabel}</Badge>
                        <Badge tone="info">
                          {file.categoryLabel}
                          {file.extension ? ` · ${file.extension}` : ""}
                        </Badge>
                        {!file.isReferenced ? <Badge tone="warning">Сиротский файл</Badge> : null}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-[var(--ink)]">{formatBytes(file.sizeBytes)}</td>
                    <td className="px-6 py-4">
                      {file.usages.length === 0 ? (
                        <p className="max-w-md text-sm text-[var(--ink-muted)]">
                          Ссылки на файл не найдены в курсах, ответах учеников и настройках платформы.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {file.usages.slice(0, 2).map((usage) => (
                            <div key={usage.key} className="max-w-xl">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge tone="success">{usage.label}</Badge>
                                {usage.href ? (
                                  <Link href={usage.href} className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-strong)]">
                                    Открыть контекст
                                  </Link>
                                ) : null}
                              </div>
                              <p className="mt-2 text-sm text-[var(--ink)]">{usage.detail}</p>
                            </div>
                          ))}
                          {file.usages.length > 2 ? (
                            <p className="text-xs text-[var(--ink-muted)]">Еще связей: {file.usages.length - 2}</p>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={buildStoragePageHref(filters, { file: file.url })}
                          className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                        >
                          Подробнее
                        </Link>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                        >
                          Открыть
                        </a>
                        {!file.isReferenced ? (
                          <DeleteStorageFileForm
                            url={file.url}
                            filters={filters}
                            selectedFileUrl={selectedFile?.url ?? null}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Сиротские файлы</h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--ink-muted)]">
              Файлы без найденных ссылок в текущем срезе. Перед удалением система повторно перепроверяет зависимости на
              сервере.
            </p>
          </div>

          {filteredOrphanFiles.length > 0 ? (
            <form action={deleteOrphanStorageFiles}>
              <HiddenReturnFields filters={filters} selectedFileUrl={selectedFile?.url ?? null} />
              <button
                type="submit"
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
              >
                Удалить все сиротские файлы
              </button>
            </form>
          ) : null}
        </div>

        {filteredOrphanFiles.length === 0 ? (
          <div className="px-6 py-10">
            <Badge tone="success">
              {currentFiltersActive ? "В текущем фильтре сиротских файлов не найдено" : "Сиротских файлов не найдено"}
            </Badge>
            <p className="mt-3 text-sm text-[var(--ink-muted)]">
              {currentFiltersActive
                ? "Попробуйте изменить фильтры, если хотите проверить другую зону хранения или тип файлов."
                : "По текущему снимку все обнаруженные файлы имеют связь с объектами платформы."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--line)] text-sm">
              <thead className="bg-[var(--surface)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <tr>
                  <th className="px-6 py-3">Файл</th>
                  <th className="px-6 py-3">Зона</th>
                  <th className="px-6 py-3">Тип</th>
                  <th className="px-6 py-3">Размер</th>
                  <th className="px-6 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {filteredOrphanFiles.map((file) => (
                  <tr key={file.url} className="align-top">
                    <td className="px-6 py-4">
                      <div className="font-medium text-[var(--ink)]">{file.fileName}</div>
                      <div className="mt-1 break-all font-mono text-xs text-[var(--ink-muted)]">{file.relativePath}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge tone="warning">{file.storageAreaLabel}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-[var(--ink)]">{file.categoryLabel}</div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                        {file.extension || "без расширения"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-[var(--ink)]">{formatBytes(file.sizeBytes)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={buildStoragePageHref(filters, { file: file.url })}
                          className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                        >
                          Подробнее
                        </Link>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                        >
                          Открыть
                        </a>
                        <DeleteStorageFileForm
                          url={file.url}
                          filters={filters}
                          selectedFileUrl={selectedFile?.url ?? null}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-sm">
        <div className="border-b border-[var(--line)] bg-[var(--surface)] px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Самые большие файлы</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {currentFiltersActive
              ? "Топ-20 по размеру в текущем фильтре."
              : "Топ-20 по размеру с попыткой привязать каждый файл к курсу, уроку, ответу ученика или настройкам брендинга."}
          </p>
        </div>

        {filteredLargestFiles.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-medium text-[var(--ink)]">Папки загрузок пока пусты.</p>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              После загрузки обложек, материалов, видео и вложений файлы появятся в этом разделе.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--line)] text-sm">
              <thead className="bg-[var(--surface)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <tr>
                  <th className="px-6 py-3">Файл</th>
                  <th className="px-6 py-3">Тип</th>
                  <th className="px-6 py-3">Размер</th>
                  <th className="px-6 py-3">Контекст</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {filteredLargestFiles.map((file) => (
                  <tr key={file.url} className="align-top">
                    <td className="px-6 py-4">
                      <div className="font-medium text-[var(--ink)]">{file.fileName}</div>
                      <div className="mt-1 break-all font-mono text-xs text-[var(--ink-muted)]">{file.relativePath}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone="neutral">{file.storageAreaLabel}</Badge>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-strong)]"
                        >
                          Открыть файл
                        </a>
                        <Link
                          href={buildStoragePageHref(filters, { file: file.url })}
                          className="inline-flex items-center rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                        >
                          Подробнее
                        </Link>
                        {!file.isReferenced ? <Badge tone="warning">Сиротский файл</Badge> : null}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-[var(--ink)]">{file.categoryLabel}</div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                        {file.extension || "без расширения"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-[var(--ink)]">{formatBytes(file.sizeBytes)}</td>
                    <td className="px-6 py-4">
                      {file.usages.length === 0 ? (
                        <div className="space-y-3">
                          <div>
                            <Badge tone="warning">Нет найденных ссылок</Badge>
                            <p className="mt-2 max-w-md text-xs text-[var(--ink-muted)]">
                              Файл найден на диске, но ссылка на него не обнаружена в курсах, ответах учеников или
                              настройках платформы.
                            </p>
                          </div>
                          <DeleteStorageFileForm
                            url={file.url}
                            filters={filters}
                            selectedFileUrl={selectedFile?.url ?? null}
                          />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {file.usages.slice(0, 3).map((usage) => (
                            <div key={usage.key} className="max-w-xl">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge tone="success">{usage.label}</Badge>
                                {usage.href ? (
                                  <Link href={usage.href} className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-strong)]">
                                    Открыть контекст
                                  </Link>
                                ) : null}
                              </div>
                              <p className="mt-2 text-sm text-[var(--ink)]">{usage.detail}</p>
                            </div>
                          ))}
                          {file.usages.length > 3 ? (
                            <p className="text-xs text-[var(--ink-muted)]">Еще связей: {file.usages.length - 3}</p>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Что дальше</h2>
        <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">
          Раздел уже закрывает обзор объёма, крупные файлы, безопасную очистку сиротских файлов и поиск по инвентарю.
          Следующим шагом можно добавить принудительное удаление связанных файлов с жёстким подтверждением риска.
        </p>
      </section>
    </main>
  );
}
