"use client";

import { FileDown, Paperclip } from "lucide-react";

import type { ColumnDef, RiskBand, SessionRow } from "@/lib/api/types";
import { formatBytes, formatDuration, formatEndpoint, formatTimestamp } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

const RISK_TONE: Record<RiskBand, "low" | "medium" | "high"> = {
  low: "low",
  medium: "medium",
  high: "high",
};

export function RiskChip({ score, band }: { score: number; band: RiskBand }) {
  return (
    <Badge tone={RISK_TONE[band]}>
      <span className="tabular">{score}</span>
      <span className="opacity-70">{band}</span>
    </Badge>
  );
}

function EndpointCell({ endpoint }: { endpoint: SessionRow["src"] }) {
  return (
    <div className="min-w-0 leading-tight">
      <div className="text-ink truncate font-mono text-xs">
        {formatEndpoint(endpoint.ip, endpoint.port)}
      </div>
      {endpoint.host !== undefined || endpoint.country !== undefined ? (
        <div className="text-2xs text-ink-faint truncate">
          {endpoint.host ?? ""}
          {endpoint.country !== undefined ? ` · ${endpoint.country}` : ""}
        </div>
      ) : null}
    </div>
  );
}

/** One cell, from the server's column definition. Undocumented types fall through to text. */
export function Cell({
  column,
  row,
  sensorNames,
}: {
  column: ColumnDef;
  row: SessionRow;
  sensorNames: Map<string, string>;
}) {
  switch (column.type) {
    case "ts":
      return (
        <span className="tabular text-ink-muted text-xs">
          {formatTimestamp(row.start, { millis: true })}
        </span>
      );
    case "ip_port":
      return <EndpointCell endpoint={column.key === "src" ? row.src : row.dst} />;
    case "bytes":
      return (
        <span className="tabular text-ink-muted text-xs">
          <span className="text-ink">{formatBytes(row.bytes.up + row.bytes.down)}</span>
          <span className="text-ink-faint ml-1">
            ↑{formatBytes(row.bytes.up)} ↓{formatBytes(row.bytes.down)}
          </span>
        </span>
      );
    case "risk":
      return <RiskChip score={row.risk.score} band={row.risk.band} />;
    case "protocol":
      return (
        <Badge tone={row.protocol === "tcp" ? "neutral" : "accent"}>
          {row.protocol}
          {row.transport !== row.protocol ? (
            <span className="opacity-60">/{row.transport}</span>
          ) : null}
        </Badge>
      );
    case "duration":
      return <DurationCell ms={row.duration_ms} />;
    case "sensor":
      return (
        <span className="text-ink-muted text-xs" title={row.sensor_id}>
          {sensorNames.get(row.sensor_id) ?? row.sensor_id}
        </span>
      );
    case "id":
      return <span className="text-2xs text-ink-faint font-mono">{row.id}</span>;
    case "country":
      return <span className="text-ink-muted text-xs">{row.dst.country ?? "—"}</span>;
    case "text":
      return <TextCell column={column} row={row} />;
    default:
      return <TextCell column={column} row={row} />;
  }
}

/** A handful of upstream sessions end before they start; show that rather than hide it. */
function DurationCell({ ms }: { ms: number }) {
  if (ms < 0) {
    return (
      <span
        className="tabular text-medium text-xs"
        title="The API reports this session ending before it started"
      >
        {formatDuration(ms)}
      </span>
    );
  }
  return <span className="tabular text-ink-muted text-xs">{formatDuration(ms)}</span>;
}

function TextCell({ column, row }: { column: ColumnDef; row: SessionRow }) {
  switch (column.key) {
    case "summary":
      return (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="text-ink truncate text-xs">{row.summary}</span>
          {row.files_count > 0 ? (
            <Paperclip className="text-ink-faint size-3 shrink-0" aria-label="has carved files" />
          ) : null}
          {row.pcap_available ? (
            <FileDown className="text-ink-faint size-3 shrink-0" aria-label="pcap available" />
          ) : null}
        </span>
      );
    case "packets":
      return (
        <span className="tabular text-ink-muted text-xs">
          ↑{row.packets.up} ↓{row.packets.down}
        </span>
      );
    case "decoder":
      return <span className="text-2xs text-ink-muted font-mono">{row.decoder}</span>;
    case "files":
      return <span className="tabular text-ink-muted text-xs">{row.files_count || "—"}</span>;
    case "dst_country":
      return <span className="text-ink-muted text-xs">{row.dst.country ?? "—"}</span>;
    default:
      return <span className="text-ink-muted truncate text-xs">—</span>;
  }
}
