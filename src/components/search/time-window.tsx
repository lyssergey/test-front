"use client";

import { formatIsoForInput, parseInputToIso } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** History covers [captureNow - 72h, captureNow]; anything older matches nothing. */
const PRESETS = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "72h", hours: 72 },
];

export function TimeWindow({
  from,
  to,
  captureNow,
  onChange,
  disabled,
}: {
  from: string;
  to: string;
  captureNow: string | undefined;
  onChange: (next: { from: string; to: string }) => void;
  disabled?: boolean;
}) {
  const applyPreset = (hours: number) => {
    const end = captureNow ?? new Date().toISOString();
    const endMs = new Date(end).getTime();
    onChange({ from: new Date(endMs - hours * 3_600_000).toISOString(), to: end });
  };

  const activePreset = PRESETS.find((preset) => {
    if (!captureNow) return false;
    const spanHours = (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;
    const endsAtNow = Math.abs(new Date(to).getTime() - new Date(captureNow).getTime()) < 120_000;
    return endsAtNow && Math.abs(spanHours - preset.hours) < 0.02;
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="border-line flex rounded border">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={disabled || !captureNow}
            onClick={() => applyPreset(preset.hours)}
            className={
              activePreset?.label === preset.label
                ? "bg-accent/15 text-accent px-2 py-1 text-xs first:rounded-l last:rounded-r"
                : "text-ink-muted hover:bg-surface-2 px-2 py-1 text-xs first:rounded-l last:rounded-r disabled:opacity-50"
            }
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          type="datetime-local"
          aria-label="Window start (UTC)"
          value={formatIsoForInput(from)}
          disabled={disabled}
          onChange={(event) => {
            const iso = parseInputToIso(event.target.value);
            if (iso) onChange({ from: iso, to });
          }}
          className="tabular w-42"
        />
        <span className="text-ink-faint text-xs">→</span>
        <Input
          type="datetime-local"
          aria-label="Window end (UTC)"
          value={formatIsoForInput(to)}
          disabled={disabled}
          onChange={(event) => {
            const iso = parseInputToIso(event.target.value);
            if (iso) onChange({ from, to: iso });
          }}
          className="tabular w-42"
        />
        <span className="text-2xs text-ink-faint">UTC</span>
      </div>

      {captureNow ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => applyPreset(72)}
          title="The capture only holds the last 72 hours"
        >
          full history
        </Button>
      ) : null}
    </div>
  );
}
