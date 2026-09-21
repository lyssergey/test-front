"use client";

import { motion } from "motion/react";
import { AlertTriangle, X } from "lucide-react";

import type { Search } from "@/lib/api/types";
import type { ResultsPhase } from "@/lib/api/search";
import { formatBytes, formatNumber, formatPercent } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const PHASE_LABEL: Record<ResultsPhase, string> = {
  idle: "",
  loading: "loading rows",
  "caught-up": "caught up — waiting for more",
  paused: "paused",
  complete: "all rows loaded",
  error: "row loading failed",
  expired: "search expired",
};

export function JobProgress({
  search,
  loadedRows,
  matchedSoFar,
  phase,
  onCancel,
  canceling,
}: {
  search: Search;
  loadedRows: number;
  /** From the results pages; more truthful than the progress estimate once rows are in. */
  matchedSoFar: number;
  phase: ResultsPhase;
  onCancel: () => void;
  canceling: boolean;
}) {
  const running = search.state === "queued" || search.state === "running";
  const { progress } = search;
  const matched = Math.max(progress.matched, matchedSoFar, loadedRows);
  const matchedIsEstimate = progress.matched_is_estimate && progress.matched > matched - 1;

  return (
    <div data-testid="job-progress" className="space-y-1.5 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={running ? "accent" : search.state === "done" ? "low" : "medium"}>
          {running ? <Spinner className="size-2.5" /> : null}
          {search.state}
        </Badge>

        <span className="tabular text-ink">
          {matchedIsEstimate ? "≈" : ""}
          {formatNumber(matched)} matched
        </span>
        <span className="tabular text-ink-faint">
          {formatNumber(loadedRows)} loaded · {PHASE_LABEL[phase]}
        </span>
        <span className="tabular text-ink-faint">
          scanned {formatNumber(progress.scanned_sessions)}
          {progress.total_sessions_estimate > 0
            ? ` of ≈${formatNumber(progress.total_sessions_estimate)}`
            : ""}
        </span>
        <span className="tabular text-ink-faint">
          ↑{formatBytes(search.stats.matched_bytes_up)} ↓
          {formatBytes(search.stats.matched_bytes_down)}
        </span>

        <span className="ml-auto flex items-center gap-2">
          <span className="tabular text-ink-muted">{formatPercent(progress.percent)}</span>
          {running ? (
            <Button size="sm" variant="danger" onClick={onCancel} disabled={canceling}>
              <X className="size-3" /> Cancel
            </Button>
          ) : null}
        </span>
      </div>

      <div className="bg-surface-2 h-1 overflow-hidden rounded-full">
        <motion.div
          className="bg-accent h-full"
          initial={{ width: 0 }}
          animate={{ width: `${String(progress.percent)}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>

      {search.warnings.length > 0 ? (
        <ul className="space-y-1">
          {search.warnings.map((warning, index) => (
            <li
              key={`${warning.code}-${warning.sensor_id}-${String(index)}`}
              className="text-2xs text-medium flex items-start gap-1.5"
            >
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span>
                <span className="font-medium">{warning.code}</span> — {warning.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
