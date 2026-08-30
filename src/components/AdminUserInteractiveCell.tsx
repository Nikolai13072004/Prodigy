"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  userId: string;
  name: string;
  login?: string;
  avatarUrl?: string | null;
  editLabel?: string;
};

type ContextMenuState = {
  x: number;
  y: number;
};

export function AdminUserInteractiveCell({ userId, name, login, avatarUrl, editLabel = "Редактировать пользователя" }: Props) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const row = root.closest("tr");
    if (!row) return;

    const handleContextMenu = (event: Event) => {
      const mouseEvent = event as MouseEvent;
      mouseEvent.preventDefault();
      setMenu({ x: mouseEvent.clientX, y: mouseEvent.clientY });
    };

    row.addEventListener("contextmenu", handleContextMenu);
    return () => row.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  useEffect(() => {
    if (!menu) return;

    const close = () => setMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  function openEditForm() {
    setMenu(null);
    router.push(`/admin/users/${userId}/edit`);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={openEditForm}
        className="group flex min-w-0 items-center gap-2 text-left"
      >
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--info-soft)] bg-[var(--info-soft)] text-xs font-semibold text-[var(--info)]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            getInitials(name)
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-[var(--ink)] group-hover:underline">
            {name}
          </span>
          {login ? (
            <span className="mt-0.5 block truncate text-xs leading-4 text-[var(--ink-muted)]">
              Логин: {login}
            </span>
          ) : null}
        </span>
      </button>

      {menu ? (
        <div
          className="fixed z-50 min-w-56 rounded-md border border-[var(--line)] bg-[var(--surface-raised)] p-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            onClick={openEditForm}
            className="block w-full rounded-sm px-3 py-1.5 text-left text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)]"
          >
            {editLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function getInitials(input: string) {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
