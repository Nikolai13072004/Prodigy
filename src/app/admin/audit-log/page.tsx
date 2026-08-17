import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import {
  describeAuditActor,
  describeAuditObject,
  formatAuditLogDateTime,
  getAuditLogOverview,
} from "@/lib/audit-log";

type Props = {
  searchParams: Promise<{
    q?: string;
    actorId?: string;
    action?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
    pageSize?: string;
  }>;
};

function buildExportHref(filters: {
  q: string;
  actorId: string;
  action: string;
  dateFrom: string;
  dateTo: string;
  format: "csv" | "json";
}) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.actorId) params.set("actorId", filters.actorId);
  if (filters.action) params.set("action", filters.action);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  params.set("format", filters.format);
  const query = params.toString();
  return query ? `/admin/audit-log/export?${query}` : "/admin/audit-log/export";
}

function buildPageHref(filters: {
  q: string;
  actorId: string;
  action: string;
  dateFrom: string;
  dateTo: string;
  pageSize: number;
  page: number;
}) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.actorId) params.set("actorId", filters.actorId);
  if (filters.action) params.set("action", filters.action);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 50) params.set("pageSize", String(filters.pageSize));
  const query = params.toString();
  return query ? `/admin/audit-log?${query}` : "/admin/audit-log";
}

export default async function AuditLogPage({ searchParams }: Props) {
  await requirePlatformAdmin();
  const overview = await getAuditLogOverview(await searchParams);

  return (
    <main className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Аудит-лог</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Кто, когда и что изменил в административной части платформы, включая входы, настройки, назначения и экспорты.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={buildExportHref({ ...overview.filters, format: "json" })}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Экспорт JSON
          </Link>
          <Link
            href={buildExportHref({ ...overview.filters, format: "csv" })}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Экспорт CSV
          </Link>
        </div>
      </div>

      <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Фильтры</h2>
            <p className="mt-1 text-sm text-zinc-600">Всего найдено событий: {overview.totalCount}</p>
          </div>
          <Link
            href="/admin/audit-log"
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Сбросить
          </Link>
        </div>

        <form action="/admin/audit-log" className="mt-5 grid gap-4 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label htmlFor="q" className="block text-sm font-medium text-zinc-900">
              Поиск
            </label>
            <input
              id="q"
              name="q"
              defaultValue={overview.filters.q}
              placeholder="Пользователь, действие, объект, IP"
              className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
            />
          </div>

          <div>
            <label htmlFor="actorId" className="block text-sm font-medium text-zinc-900">
              Пользователь
            </label>
            <select
              id="actorId"
              name="actorId"
              defaultValue={overview.filters.actorId}
              className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
            >
              <option value="">Все</option>
              {overview.actorOptions.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name} ({actor.login})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="action" className="block text-sm font-medium text-zinc-900">
              Действие
            </label>
            <select
              id="action"
              name="action"
              defaultValue={overview.filters.action}
              className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
            >
              <option value="">Все</option>
              {overview.actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="dateFrom" className="block text-sm font-medium text-zinc-900">
              С даты
            </label>
            <input
              id="dateFrom"
              name="dateFrom"
              type="date"
              defaultValue={overview.filters.dateFrom}
              className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
            />
          </div>

          <div>
            <label htmlFor="dateTo" className="block text-sm font-medium text-zinc-900">
              По дату
            </label>
            <input
              id="dateTo"
              name="dateTo"
              type="date"
              defaultValue={overview.filters.dateTo}
              className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
            />
          </div>

          <div>
            <label htmlFor="pageSize" className="block text-sm font-medium text-zinc-900">
              На странице
            </label>
            <select
              id="pageSize"
              name="pageSize"
              defaultValue={String(overview.filters.pageSize)}
              className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>

          <div className="lg:col-span-6 flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Применить фильтры
            </button>
          </div>
        </form>
      </section>

      <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Дата и время</th>
                <th className="px-4 py-3">Пользователь</th>
                <th className="px-4 py-3">Действие</th>
                <th className="px-4 py-3">Объект</th>
                <th className="px-4 py-3">IP / User-Agent</th>
                <th className="px-4 py-3">Метаданные</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {overview.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-500">
                    По текущим фильтрам событий не найдено.
                  </td>
                </tr>
              ) : (
                overview.items.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-4 py-4 whitespace-nowrap text-zinc-700">{formatAuditLogDateTime(item.createdAt)}</td>
                    <td className="px-4 py-4 text-zinc-900">
                      <div className="font-medium">{describeAuditActor(item)}</div>
                      {item.actorId ? <div className="mt-1 text-xs text-zinc-500">ID: {item.actorId}</div> : null}
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                        {item.action}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-zinc-700">
                      <div className="font-medium text-zinc-900">{describeAuditObject(item)}</div>
                      <div className="mt-1 text-xs text-zinc-500">Тип: {item.objectType}</div>
                    </td>
                    <td className="px-4 py-4 text-zinc-700">
                      <div>{item.ipAddress ?? "-"}</div>
                      <div className="mt-1 max-w-sm break-words text-xs text-zinc-500">{item.userAgent ?? "-"}</div>
                    </td>
                    <td className="px-4 py-4 text-zinc-700">
                      {item.metadata ? (
                        <details>
                          <summary className="cursor-pointer text-xs font-medium text-zinc-700">Показать</summary>
                          <pre className="mt-2 max-w-md overflow-x-auto rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100">
                            {JSON.stringify(item.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-xs text-zinc-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {overview.totalPages > 1 ? (
        <nav className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600">
          <div>
            Страница {overview.filters.page} из {overview.totalPages}
          </div>
          <div className="flex gap-2">
            <Link
              href={buildPageHref({ ...overview.filters, page: Math.max(1, overview.filters.page - 1) })}
              aria-disabled={overview.filters.page <= 1}
              className={`rounded-xl border px-4 py-2 ${
                overview.filters.page <= 1
                  ? "pointer-events-none border-zinc-200 text-zinc-400"
                  : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              Назад
            </Link>
            <Link
              href={buildPageHref({ ...overview.filters, page: Math.min(overview.totalPages, overview.filters.page + 1) })}
              aria-disabled={overview.filters.page >= overview.totalPages}
              className={`rounded-xl border px-4 py-2 ${
                overview.filters.page >= overview.totalPages
                  ? "pointer-events-none border-zinc-200 text-zinc-400"
                  : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              Вперед
            </Link>
          </div>
        </nav>
      ) : null}
    </main>
  );
}
