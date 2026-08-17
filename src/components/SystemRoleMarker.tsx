import { Lock } from "lucide-react";

export function SystemRoleMarker() {
  return (
    <span
      aria-label="Системная роль"
      title="Системная роль"
      className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700"
    >
      <Lock className="h-3 w-3" aria-hidden="true" strokeWidth={2.25} />
    </span>
  );
}
