"use client";

import Link from "next/link";
import { useState } from "react";

import { useRelatedSessions } from "@/lib/api/queries";
import type { RelatedWindow, SessionId } from "@/lib/api/types";
import { formatBytes, formatDuration, formatTimestamp } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";

const WINDOWS: RelatedWindow[] = ["15m", "1h", "6h"];

/** Other sessions between the same two hosts, which is how a pattern becomes visible. */
export function RelatedList({ sessionId }: { sessionId: SessionId }) {
  const [window, setWindow] = useState<RelatedWindow>("1h");
  const related = useRelatedSessions(sessionId, window);

  return (
    <div>
      <div className="border-line flex items-center gap-2 border-b px-3 py-1.5">
        <span className="text-2xs text-ink-faint">Same address pair, ±</span>
        <div className="border-line flex rounded border">
          {WINDOWS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setWindow(option)}
              className={
                window === option
                  ? "bg-accent/15 text-2xs text-accent px-2 py-0.5 first:rounded-l last:rounded-r"
                  : "text-2xs text-ink-muted hover:bg-surface-2 px-2 py-0.5 first:rounded-l last:rounded-r"
              }
            >
              {option}
            </button>
          ))}
        </div>
        {related.data ? (
          <span className="text-2xs text-ink-faint ml-auto">
            {related.data.items.length}
            {related.data.next_cursor !== null ? "+" : ""} sessions
          </span>
        ) : null}
      </div>

      {related.isLoading ? (
        <div className="space-y-1 p-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
      ) : related.isError ? (
        <div className="p-3">
          <ErrorState error={related.error} onRetry={() => void related.refetch()} />
        </div>
      ) : related.data && related.data.items.length > 0 ? (
        <ul className="divide-line divide-y">
          {related.data.items.map((row) => (
            <li key={row.id}>
              <Link
                href={`/sessions/${row.id}`}
                className="hover:bg-surface-2 flex items-center gap-3 px-3 py-1.5"
              >
                <span className="tabular text-2xs text-ink-faint w-44 shrink-0">
                  {formatTimestamp(row.start, { millis: true })}
                </span>
                <Badge tone="accent">{row.protocol}</Badge>
                <span className="text-ink min-w-0 flex-1 truncate text-xs">{row.summary}</span>
                <span className="tabular text-2xs text-ink-faint shrink-0">
                  {formatBytes(row.bytes.up + row.bytes.down)} · {formatDuration(row.duration_ms)}
                </span>
                {row.id === sessionId ? <Badge tone="info">this one</Badge> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No neighbouring sessions"
          hint="Nothing else between these two hosts in this window."
        />
      )}
    </div>
  );
}
