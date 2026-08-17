"use client";

import { useRef } from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
  confirmMessage: string;
  name?: string;
  value?: string;
};

export function ConfirmSubmitButton({
  children,
  className,
  confirmMessage,
  name,
  value,
}: Props) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <button
      ref={buttonRef}
      type="submit"
      className={className}
      name={name}
      value={value}
      onClick={(event) => {
        if (window.confirm(confirmMessage)) return;
        event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
