"use client";

import { ChevronDown } from "lucide-react";

import type { Sensor, SensorStatus } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover } from "@/components/ui/popover";

const STATUS_TONE: Record<SensorStatus, "low" | "medium" | "high"> = {
  online: "low",
  lagging: "medium",
  offline: "high",
};

/** A search takes 1-5 sensors, and only the ones this user may read. */
export function SensorPicker({
  sensors,
  selected,
  onChange,
  disabled,
}: {
  sensors: Sensor[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const label =
    selected.length === 0
      ? "No sensors"
      : selected.length === sensors.length
        ? `All ${String(sensors.length)} sensors`
        : sensors
            .filter((sensor) => selected.includes(sensor.id))
            .map((sensor) => sensor.name)
            .join(", ");

  const toggle = (id: string, checked: boolean) => {
    if (checked) {
      if (selected.length >= 5) return;
      onChange([...selected, id]);
    } else {
      onChange(selected.filter((current) => current !== id));
    }
  };

  const problems = sensors.filter(
    (sensor) => selected.includes(sensor.id) && sensor.status !== "online",
  );

  return (
    <div className="flex items-center gap-2">
      <Popover
        align="start"
        className="w-80"
        trigger={
          <Button size="sm" disabled={disabled} className="max-w-64">
            <span className="truncate">{label}</span>
            <ChevronDown className="text-ink-faint size-3.5 shrink-0" />
          </Button>
        }
      >
        <div className="space-y-1">
          {sensors.map((sensor) => {
            const checked = selected.includes(sensor.id);
            return (
              <div
                key={sensor.id}
                className="hover:bg-surface-3 flex items-start gap-2 rounded px-1.5 py-1"
              >
                <Checkbox
                  checked={checked}
                  disabled={!checked && selected.length >= 5}
                  onCheckedChange={(next) => toggle(sensor.id, next)}
                  className="mt-0.5"
                  label={
                    <span className="leading-tight">
                      <span className="text-ink block text-sm">{sensor.name}</span>
                      <span className="text-2xs text-ink-faint block">
                        {sensor.site} · {sensor.kind} · decoder {sensor.decoder_version}
                      </span>
                    </span>
                  }
                />
                <Badge tone={STATUS_TONE[sensor.status]} className="ml-auto shrink-0">
                  {sensor.status === "online"
                    ? "online"
                    : `${sensor.status} ${String(sensor.lag_seconds)}s`}
                </Badge>
              </div>
            );
          })}
          {selected.length >= 5 ? (
            <p className="text-2xs text-ink-faint px-1.5 pt-1">A search takes at most 5 sensors.</p>
          ) : null}
        </div>
      </Popover>

      {problems.map((sensor) => (
        <Badge key={sensor.id} tone="medium" title={`Last packet ${sensor.last_packet_at}`}>
          {sensor.name} {sensor.status}
        </Badge>
      ))}
    </div>
  );
}
