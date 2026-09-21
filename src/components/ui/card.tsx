import type { ReactNode } from "react";

import { cn } from "./cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("border-line bg-surface rounded-md border", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  aside,
  className,
}: {
  title: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "border-line flex items-center justify-between gap-3 border-b px-3 py-2",
        className,
      )}
    >
      <h2 className="text-ink-muted text-xs font-medium tracking-wide uppercase">{title}</h2>
      {aside}
    </header>
  );
}
