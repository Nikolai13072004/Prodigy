"use client";

import { LoginForm } from "./LoginForm";

export function LoginClientSection({ callbackUrl }: { callbackUrl?: string }) {
  return <LoginForm callbackUrl={callbackUrl} />;
}
