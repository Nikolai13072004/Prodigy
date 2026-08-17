import { requirePlatformAdmin } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function AdminApiPage() {
  await requirePlatformAdmin();

  const tokens = await prisma.apiToken.findMany({
    orderBy: [{ createdAt: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      scope: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });

  return (
    <main className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">API-токены</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Здесь собраны токены внешних интеграций: для каждого видно название, scope, дату создания и время
            последнего использования.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 shadow-sm">
          Активных записей: <span className="font-semibold text-zinc-950">{tokens.filter((item) => !item.revokedAt).length}</span>
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-950">Список токенов интеграций</h2>
          <p className="mt-1 text-sm text-zinc-600">Таблица обновляется из базы платформы и доступна только администраторам.</p>
        </div>

        {tokens.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-medium text-zinc-950">Токены интеграций пока не зарегистрированы.</p>
            <p className="mt-2 text-sm text-zinc-600">
              Когда в платформе появятся API-интеграции, здесь будут показаны их название, scope и последняя активность.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-6 py-3">Название</th>
                  <th className="px-6 py-3">Scope</th>
                  <th className="px-6 py-3">Дата создания</th>
                  <th className="px-6 py-3">Последнее использование</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {tokens.map((token) => (
                  <tr key={token.id} className="align-top">
                    <td className="px-6 py-4">
                      <div className="font-medium text-zinc-950">{token.name}</div>
                      {token.revokedAt ? (
                        <span className="mt-2 inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                          Отозван
                        </span>
                      ) : (
                        <span className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          Активен
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <code className="rounded-lg bg-zinc-100 px-2 py-1 text-xs text-zinc-800">{token.scope}</code>
                    </td>
                    <td className="px-6 py-4 text-zinc-700">{formatDateTime(token.createdAt)}</td>
                    <td className="px-6 py-4 text-zinc-700">
                      {token.lastUsedAt ? formatDateTime(token.lastUsedAt) : "Не использовался"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
