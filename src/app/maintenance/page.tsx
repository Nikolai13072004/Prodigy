import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformSettings, resolveMaintenanceMessage } from "@/lib/platform-settings";

export default async function MaintenancePage() {
  const settings = await getPlatformSettings();

  if (!settings.maintenanceMode) {
    redirect("/login");
  }

  const message = resolveMaintenanceMessage(settings.maintenanceMessage);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col justify-center px-4 py-12">
      <div className="rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="flex flex-col items-center text-center">
          {settings.logoUrl ? (
            <Image
              src={settings.logoUrl}
              alt={settings.siteName}
              width={180}
              height={58}
              className="h-[3.6rem] w-auto object-contain"
              priority
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="text-center text-3xl font-semibold text-zinc-950">{settings.siteName}</div>
          )}

          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Технические работы</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">Платформа временно недоступна</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">{message}</p>
        </div>

        <div className="mt-8 grid gap-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600 sm:grid-cols-2">
          <div>
            <p className="font-medium text-zinc-950">Что происходит</p>
            <p className="mt-2">
              Доступ к платформе временно ограничен на время обновления или сервисных работ. Во время режима
              обслуживания продолжить работу могут только администраторы.
            </p>
          </div>
          <div>
            <p className="font-medium text-zinc-950">Нужен срочный доступ?</p>
            <p className="mt-2">Если вы администратор платформы, можно перейти на страницу входа и авторизоваться.</p>
            {settings.supportEmail ? (
              <p className="mt-2">
                Поддержка:{" "}
                <a className="text-zinc-800 underline decoration-zinc-300 underline-offset-2" href={`mailto:${settings.supportEmail}`}>
                  {settings.supportEmail}
                </a>
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Страница входа
          </Link>
          <a
            href="/maintenance"
            className="rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Обновить страницу
          </a>
        </div>
      </div>
    </main>
  );
}
