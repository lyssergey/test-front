import { formatBytes, formatDuration, formatNumber, formatTimestamp } from "@/lib/format";

import { SensitiveValue } from "./sensitive";

/** Renders one decoded value using the type and unit the schema published. */
export function DecodedValue({
  value,
  type,
  unit,
  sensitive,
}: {
  value: unknown;
  type?: string;
  unit?: string;
  sensitive?: boolean;
}) {
  if (value === undefined || value === null) return <span className="text-ink-faint">—</span>;

  if (typeof value === "boolean") {
    return (
      <span className={value ? "text-low" : "text-ink-faint"}>{value ? "true" : "false"}</span>
    );
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return (
      <pre className="bg-surface-2 text-2xs text-ink-muted overflow-x-auto rounded p-1.5 font-mono">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  const text = String(value);
  if (sensitive === true) return <SensitiveValue value={text} />;

  // v1 sends numbers as strings, so coerce before formatting by unit.
  const numeric = Number(text);
  if (Number.isFinite(numeric) && text.trim() !== "") {
    if (unit === "bytes") return <span className="tabular">{formatBytes(numeric)}</span>;
    if (unit === "seconds")
      return <span className="tabular">{formatDuration(numeric * 1000)}</span>;
    if (unit === "milliseconds") return <span className="tabular">{formatDuration(numeric)}</span>;
    if (type === "number") return <span className="tabular">{formatNumber(numeric)}</span>;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return <span className="tabular">{formatTimestamp(text, { millis: true })}</span>;
  }

  return <span className="break-all">{text}</span>;
}
