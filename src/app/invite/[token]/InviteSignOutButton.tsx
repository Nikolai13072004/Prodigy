"use client";

import { signOut } from "next-auth/react";

type Props = {
  invitePath: string;
};

export function InviteSignOutButton({ invitePath }: Props) {
  async function handleClick() {
    await signOut({ redirect: false });
    window.location.href = invitePath;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
    >
      Выйти и продолжить регистрацию
    </button>
  );
}
