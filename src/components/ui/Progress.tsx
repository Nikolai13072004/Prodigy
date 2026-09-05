import { cn } from "./cn";

type ProgressProps = {
  value: number;
  tone?: "accent" | "success";
  className?: string;
};

// Индикатор прогресса на токенах.
export function Progress({ value, tone = "accent", className }: ProgressProps) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  const barColor = tone === "success" ? "var(--success)" : "var(--accent)";

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[var(--line)]", className)}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: barColor }} />
    </div>
  );
}
