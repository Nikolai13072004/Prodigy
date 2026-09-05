import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type CardPadding = "none" | "sm" | "md" | "lg";

const paddingClasses: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: CardPadding;
};

// Базовая поверхность-панель на токенах. Обе темы — из коробки.
export function Card({ padding = "md", className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface-raised)] shadow-sm",
        paddingClasses[padding],
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold text-[var(--ink)]", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm text-[var(--ink-muted)]", className)} {...props} />;
}
