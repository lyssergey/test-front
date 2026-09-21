"use client";

import type { SessionFlow } from "@/lib/api/types";
import { formatBytes, formatNumber } from "@/lib/format";

const HEIGHT = 120;
const MID = HEIGHT / 2;

/**
 * Bytes up and down over the session.
 *
 * Idle buckets are omitted upstream, so samples are placed by `t`: a quiet
 * stretch shows as a gap instead of collapsing the timeline.
 */
export function FlowChart({ flow }: { flow: SessionFlow }) {
  const { samples } = flow;
  if (samples.length === 0) {
    return <p className="text-ink-faint p-3 text-xs">No flow samples for this session.</p>;
  }

  const start = samples[0]!.t;
  const end = samples.at(-1)!.t + flow.bucket_ms;
  const span = Math.max(1, end - start);
  const peak = Math.max(1, ...samples.map((s) => Math.max(s.bytes_up, s.bytes_down)));

  const totals = samples.reduce(
    (sum, sample) => ({
      up: sum.up + sample.bytes_up,
      down: sum.down + sample.bytes_down,
      packets: sum.packets + sample.packets_up + sample.packets_down,
    }),
    { up: 0, down: 0, packets: 0 },
  );

  return (
    <div className="space-y-2 p-3">
      <div className="text-2xs text-ink-faint flex flex-wrap items-center gap-3">
        <span>{String(flow.bucket_ms)} ms buckets</span>
        <span>{samples.length} samples</span>
        <span className="text-low">↑ {formatBytes(totals.up)}</span>
        <span className="text-info">↓ {formatBytes(totals.down)}</span>
        <span>{formatNumber(totals.packets)} packets</span>
        <span className="ml-auto">peak {formatBytes(peak)} per bucket</span>
      </div>

      <svg
        viewBox={`0 0 1000 ${String(HEIGHT)}`}
        preserveAspectRatio="none"
        className="h-30 w-full"
        role="img"
        aria-label="Bytes up and down over the session"
      >
        <line x1={0} x2={1000} y1={MID} y2={MID} stroke="var(--color-line)" strokeWidth={1} />
        {samples.map((sample) => {
          const x = ((sample.t - start) / span) * 1000;
          const width = Math.max(1, (flow.bucket_ms / span) * 1000);
          const up = (sample.bytes_up / peak) * (MID - 2);
          const down = (sample.bytes_down / peak) * (MID - 2);
          return (
            <g key={sample.t}>
              <rect
                x={x}
                y={MID - up}
                width={width}
                height={up}
                fill="var(--color-low)"
                opacity={0.8}
              />
              <rect
                x={x}
                y={MID}
                width={width}
                height={down}
                fill="var(--color-info)"
                opacity={0.8}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
