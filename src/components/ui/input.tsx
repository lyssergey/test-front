import type { InputHTMLAttributes } from "react";

import { cn } from "./cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "border-line bg-surface text-ink h-8 min-w-0 rounded border px-2 text-sm",
        "placeholder:text-ink-faint focus:border-accent-dim focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
