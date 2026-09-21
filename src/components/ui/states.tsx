import type { ReactNode } from "react";

import { isApiError } from "@/lib/api/client";

import { Button } from "./button";
import { cn } from "./cn";

export function EmptyState({
  title,
  hint,
  icon,
  className,
}: {
  title: string;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="text-ink-faint">{icon}</div> : null}
      <p className="text-ink-muted text-sm">{title}</p>
      {hint ? <p className="text-ink-faint max-w-md text-xs">{hint}</p> : null}
    </div>
  );
}

/** Shows the upstream error code alongside the message: it is the stable part. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const api = isApiError(error) ? error : null;
  const message = api?.detail ?? (error instanceof Error ? error.message : "Something went wrong");

  return (
    <div
      className={cn(
        "border-high/40 bg-high/8 flex flex-col items-start gap-2 rounded border p-3",
        className,
      )}
      role="alert"
      data-testid="error-state"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-ink text-sm">{message}</span>
        {api ? (
          <code className="bg-surface-2 text-2xs text-ink-faint rounded px-1 py-0.5 font-mono">
            {api.status} {api.code}
          </code>
        ) : null}
      </div>
      {api && api.issues.length > 0 ? (
        <ul className="text-ink-muted list-inside list-disc text-xs">
          {api.issues.map((issue, index) => (
            <li key={index}>
              <span className="font-mono">{issue.loc.join(".")}</span> — {issue.msg}
            </li>
          ))}
        </ul>
      ) : null}
      {api?.retryAfterSeconds !== undefined ? (
        <p className="text-ink-faint text-xs">Retry in about {api.retryAfterSeconds}s.</p>
      ) : null}
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("bg-surface-2 animate-pulse rounded", className)} />;
}
