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
    <header className="border-b border-[var(--line)] bg-[var(--surface-raised)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-[var(--ink)]"
        >
          Корпоративное обучение
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
          <Link
            href="/"
            className="text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            Курсы
          </Link>
          {email && (
            <Link
              href="/history"
              className="text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              История
            </Link>
          )}
          {staff && (
            <Link
              href="/courses/new"
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-white hover:bg-[var(--accent-strong)]"
            >
              Новый курс
            </Link>
          )}
          {email ? (
            <>
              <span className="hidden max-w-[200px] truncate text-xs text-[var(--ink-muted)] sm:inline" title={email ?? ""}>
                {displayName ?? email}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-[var(--ink-muted)] underline decoration-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                Выйти
              </button>
            </>
          ) : (
            !onLoginPage && (
              <Link
                href="/login"
                className="text-[var(--ink-muted)] underline hover:text-[var(--ink)]"
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
