"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "./cn";

type Option = { value: string; label: ReactNode; disabled?: boolean };

// Drop-in замена нативного <select>: те же пропсы (name/value/defaultValue/
// onChange + <option>-дети), но выпадающий список — свой, в теме приложения,
// одинаковый во всех браузерах. Для отправки формы рендерим скрытый input,
// поэтому server actions продолжают читать значение по name без изменений.
type SelectProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  // Совместимо с прежним onChange={(e) => e.target.value}.
  onChange?: (event: { target: { value: string; name?: string } }) => void;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
  form?: string;
  children?: ReactNode;
  "aria-label"?: string;
};

// Разбор <option>-детей в массив опций (drop-in для нативного select).
function parseOptions(children: ReactNode): Option[] {
  const out: Option[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as {
      value?: string | number;
      children?: ReactNode;
      disabled?: boolean;
    };
    if (child.type === "option") {
      out.push({
        value: String(props.value ?? ""),
        label: props.children ?? String(props.value ?? ""),
        disabled: props.disabled,
      });
    } else if (child.type === "optgroup") {
      out.push(...parseOptions(props.children));
    }
  });
  return out;
}

const triggerClass =
  "flex h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] " +
  "border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--ink)] " +
  "focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function Select({
  name,
  value,
  defaultValue,
  onChange,
  onValueChange,
  disabled,
  required,
  placeholder = "Выберите…",
  id,
  className,
  form,
  children,
  "aria-label": ariaLabel,
}: SelectProps) {
  const options = useMemo(() => parseOptions(children), [children]);
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<string>(
    () => defaultValue ?? options[0]?.value ?? "",
  );
  const current = isControlled ? (value as string) : internal;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const currentIndex = options.findIndex((o) => o.value === current);
  const selectedLabel = currentIndex >= 0 ? options[currentIndex].label : null;

  // Клик вне компонента закрывает список.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function openMenu() {
    setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
    setOpen(true);
  }

  function commit(v: string) {
    if (!isControlled) setInternal(v);
    onChange?.({ target: { value: v, name } });
    onValueChange?.(v);
    setOpen(false);
  }

  function moveActive(delta: number) {
    setActiveIndex((idx) => {
      let next = idx;
      for (let step = 0; step < options.length; step++) {
        next = (next + delta + options.length) % options.length;
        if (!options[next]?.disabled) break;
      }
      return next;
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt && !opt.disabled) commit(opt.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name ? <input type="hidden" name={name} value={current} required={required} form={form} /> : null}
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={onKeyDown}
        className={triggerClass}
      >
        <span className={cn("truncate", selectedLabel == null && "text-[var(--ink-muted)]")}>
          {selectedLabel ?? placeholder}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={cn("h-4 w-4 shrink-0 text-[var(--ink-muted)] transition-transform", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          className={
            "absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-[var(--radius-control)] " +
            "border border-[var(--line)] bg-[var(--surface-raised)] p-1 shadow-[var(--shadow-2)]"
          }
        >
          {options.map((opt, index) => {
            const selected = opt.value === current;
            const active = index === activeIndex;
            return (
              <li
                key={`${opt.value}-${index}`}
                role="option"
                aria-selected={selected}
                aria-disabled={opt.disabled}
                onMouseEnter={() => !opt.disabled && setActiveIndex(index)}
                onMouseDown={(e) => {
                  // Выбор на нажатии: надёжнее click (не теряется из-за
                  // перерисовки при наведении) и сразу закрывает список.
                  e.preventDefault();
                  if (!opt.disabled) commit(opt.value);
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-sm",
                  opt.disabled && "cursor-not-allowed opacity-50",
                  active && !opt.disabled ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "text-[var(--ink)]",
                  selected && "font-medium",
                )}
              >
                <span className="truncate">{opt.label}</span>
                {selected ? (
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 10l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </li>
            );
          })}
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--ink-muted)]">Нет вариантов</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
