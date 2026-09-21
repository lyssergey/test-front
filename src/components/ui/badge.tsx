import type { ReactNode } from "react";

import { cn } from "./cn";

type Tone = "neutral" | "accent" | "low" | "medium" | "high" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-muted border-line",
  accent: "bg-accent/12 text-accent border-accent/30",
  low: "bg-low/12 text-low border-low/30",
  medium: "bg-medium/12 text-medium border-medium/30",
  high: "bg-high/15 text-high border-high/40",
  info: "bg-info/12 text-info border-info/30",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "text-2xs inline-flex items-center gap-1 rounded border px-1.5 py-0.5 whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
