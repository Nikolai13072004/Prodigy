"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { isStaffRole } from "@/lib/roles";

type Props = {
  displayName: string | null;
  email: string | null;
  role: string | null;
  roles: string[];
};

export function NavClient({ displayName, email, role, roles }: Props) {
  const pathname = usePathname();
  const staff = isStaffRole(roles.length ? roles : role);
  const onLoginPage = pathname === "/login";
  const handleSignOut = async () => {
    await signOut({ redirect: false });
    window.location.href = "/login";
  };

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Корпоративное обучение
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
          <Link
            href="/"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Курсы
          </Link>
          {email && (
            <Link
              href="/history"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              История
            </Link>
          )}
          {staff && (
            <Link
              href="/courses/new"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Новый курс
            </Link>
          )}
          {email ? (
            <>
              <span className="hidden max-w-[200px] truncate text-xs text-zinc-500 sm:inline" title={email ?? ""}>
                {displayName ?? email}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-zinc-600 underline decoration-zinc-400 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Выйти
              </button>
            </>
          ) : (
            !onLoginPage && (
              <Link
                href="/login"
                className="text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Войти
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}
