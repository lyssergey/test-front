"use client";

import { motion } from "motion/react";
import { useState } from "react";

import type { Histogram as HistogramData } from "@/lib/api/types";
import { barHeight } from "@/lib/chart-scale";
import { formatNumber, formatTimestamp } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";

const HEIGHT = 64;

/** Bars are placed by timestamp: uncaptured buckets are absent upstream, so a gap stays a hole. */
export function Histogram({
  data,
  from,
  to,
  loading,
  unavailableReason,
  onPickWindow,
}: {
  data: HistogramData | undefined;
  from: string;
  to: string;
  loading: boolean;
  /** Set when the filter has no flat `field:op:value` form the endpoint accepts. */
  unavailableReason?: string;
  onPickWindow: (window: { from: string; to: string }) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (unavailableReason !== undefined) {
    return (
      <div className="text-2xs text-ink-faint flex h-16 items-center justify-center px-3">
        {unavailableReason}
      </div>
    );
  }

  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  const span = Math.max(1, end - start);
  const buckets = data?.buckets ?? [];
  const peak = Math.max(1, ...buckets.map((bucket) => sum(bucket.by_protocol)));
  // Hoisted rather than indexed inside JSX: narrowing an element access by a
  // variable index is not something every TypeScript version agrees on.
  const hoveredBucket = hovered === null ? undefined : buckets[hovered];

  // Zooming to one bucket only means something while a bucket is narrower than
  // the window; at one bucket per window a click would change nothing visible.
  const bucketMs = (data?.bucket_s ?? 300) * 1000;
  const canZoom = buckets.length > 1 && bucketMs < span;

  return (
    <div className="relative px-3 py-1.5">
      <div className="text-2xs text-ink-faint mb-1 flex items-center gap-2">
        <span>Sessions over time</span>
        {loading ? <Spinner className="size-3" /> : null}
        {data ? (
          <span>
            · {String(data.bucket_s)}s buckets · peak {formatNumber(peak)} · √ scale
          </span>
        ) : null}
        {canZoom ? <span>· click a bar to zoom</span> : null}
        <span className="tabular ml-auto">{formatTimestamp(from)}</span>
        <span>→</span>
        <span className="tabular">{formatTimestamp(to)}</span>
      </div>

      <svg
        viewBox={`0 0 1000 ${String(HEIGHT)}`}
        preserveAspectRatio="none"
        className="h-16 w-full"
        role="img"
        aria-label="Matching sessions over time"
      >
        {buckets.map((bucket, index) => {
          const bucketStart = new Date(bucket.t).getTime();
          const x = ((bucketStart - start) / span) * 1000;
          const width = Math.max(1.2, (bucketMs / span) * 1000);
          const total = sum(bucket.by_protocol);
          const height = barHeight(total, peak, HEIGHT - 4);

          return (
            <motion.rect
              key={bucket.t}
              x={x}
              width={width}
              initial={{ height: 0, y: HEIGHT }}
              animate={{ height, y: HEIGHT - height }}
              transition={{ duration: 0.25, delay: Math.min(index * 0.001, 0.2) }}
              className={canZoom ? "cursor-pointer" : undefined}
              fill={
                bucket.partial === true
                  ? "var(--color-medium)"
                  : bucket.coverage < 1
                    ? "var(--color-accent-dim)"
                    : "var(--color-accent)"
              }
              opacity={hovered === null || hovered === index ? 0.85 : 0.4}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onClick={
                canZoom
                  ? () =>
                      onPickWindow({
                        from: new Date(bucketStart).toISOString(),
                        to: new Date(bucketStart + bucketMs).toISOString(),
                      })
                  : undefined
              }
            />
          );
        })}
      </svg>

      {hoveredBucket ? (
        <BucketTooltip bucket={hoveredBucket} />
      ) : buckets.length === 0 && !loading ? (
        <p className="text-2xs text-ink-faint absolute inset-x-0 top-8 text-center">
          No capture in this window
        </p>
      ) : null}
    </div>
  );
}

function BucketTooltip({ bucket }: { bucket: HistogramData["buckets"][number] }) {
  const entries = Object.entries(bucket.by_protocol).sort((a, b) => b[1] - a[1]);
  return (
    <div className="border-line bg-surface-2/95 text-2xs pointer-events-none absolute top-1 right-3 rounded border px-2 py-1 shadow-lg">
      <div className="tabular text-ink">{formatTimestamp(bucket.t)}</div>
      <div className="text-ink-faint">
        {formatNumber(sum(bucket.by_protocol))} sessions
        {bucket.coverage < 1 ? ` · ${String(Math.round(bucket.coverage * 100))}% captured` : ""}
        {bucket.partial === true ? " · partial" : ""}
      </div>
      <div className="text-ink-muted mt-0.5 flex flex-wrap gap-x-2">
        {entries.slice(0, 6).map(([protocol, count]) => (
          <span key={protocol}>
            {protocol} {formatNumber(count)}
          </span>
        ))}
      </div>
    </div>
  );
}

function sum(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}
