"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui";

type Props = {
  invitePath: string;
};

export function InviteSignOutButton({ invitePath }: Props) {
  async function handleClick() {
    await signOut({ redirect: false });
    window.location.href = invitePath;
  }

  return (
    <Button type="button" variant="primary" onClick={handleClick} className="w-full">
      Выйти и продолжить регистрацию
    </Button>
  );
}
