import { Lock } from "lucide-react";

export function SystemRoleMarker() {
  return (
    <span
      aria-label="Системная роль"
      title="Системная роль"
      className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink-muted)] ring-1 ring-[var(--line)]"
    >
      <Lock className="h-3 w-3" aria-hidden="true" strokeWidth={2.25} />
    </span>
  );
}
