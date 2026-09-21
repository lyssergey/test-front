"use client";

import { columnVisibilityFeature, coreFeatures, useTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Columns3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import type { ColumnDef, Sensor, SessionRow, SortKey } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover } from "@/components/ui/popover";

import { Cell } from "./cells";

const ROW_HEIGHT = 34;

/** Grid columns the API lets a search sort by, mapped to its sort keys. */
const SORT_BY_COLUMN: Record<string, "ts" | "bytes" | "risk"> = {
  start: "ts",
  bytes: "bytes",
  risk: "risk",
};

const features = { ...coreFeatures, columnVisibilityFeature };

export function ResultsTable({
  rows,
  columns,
  sensors,
  sort,
  onSortChange,
  sortEnabled,
  footer,
}: {
  rows: SessionRow[];
  columns: ColumnDef[];
  sensors: Sensor[];
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  /** Upstream refuses a re-sort until the search has finished. */
  sortEnabled: boolean;
  footer: React.ReactNode;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(columns.map((column) => [column.key, column.default_visible])),
  );

  const sensorNames = useMemo(
    () => new Map(sensors.map((sensor) => [sensor.id, sensor.name])),
    [sensors],
  );

  const tableColumns = useMemo(
    () =>
      columns.map((column) => ({
        id: column.key,
        header: column.label,
        cell: ({ row }: { row: { original: SessionRow } }) => (
          <Cell column={column} row={row.original} sensorNames={sensorNames} />
        ),
      })),
    [columns, sensorNames],
  );

  const table = useTable({
    features,
    columns: tableColumns,
    data: rows,
    getRowId: (row) => row.id,
    state: { columnVisibility: visibility },
    onColumnVisibilityChange: setVisibility,
  });

  const visibleColumns = table.getVisibleLeafColumns();
  const widths = useMemo(
    () => new Map(columns.map((column) => [column.key, column.width_hint])),
    [columns],
  );
  const templateColumns = visibleColumns
    .map((column) => {
      const width = widths.get(column.id) ?? 120;
      return `minmax(${String(Math.min(width, 140))}px, ${String(width)}fr)`;
    })
    .join(" ");

  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const currentSortField = sort.replace("-", "");
  const descending = sort.startsWith("-");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-line flex shrink-0 items-center gap-2 border-b px-2 py-1">
        {footer}
        <Popover
          align="end"
          className="w-56"
          trigger={
            <Button size="sm" variant="ghost" className="ml-auto">
              <Columns3 className="size-3.5" /> Columns
            </Button>
          }
        >
          <div className="space-y-0.5">
            {columns.map((column) => (
              <Checkbox
                key={column.key}
                checked={visibility[column.key] ?? true}
                onCheckedChange={(checked) =>
                  setVisibility((current) => ({ ...current, [column.key]: checked }))
                }
                label={<span className="text-xs">{column.label}</span>}
                className="hover:bg-surface-3 rounded px-1 py-0.5"
              />
            ))}
          </div>
        </Popover>
      </div>

      <div role="grid" aria-rowcount={tableRows.length} className="flex min-h-0 flex-1 flex-col">
        <div
          role="row"
          className="border-line bg-surface-2 grid shrink-0 items-center gap-2 border-b px-2"
          style={{ gridTemplateColumns: templateColumns }}
        >
          {visibleColumns.map((column) => {
            const sortKey = SORT_BY_COLUMN[column.id];
            const active = sortKey !== undefined && sortKey === currentSortField;
            const header = String(column.columnDef.header ?? column.id);

            if (sortKey === undefined) {
              return (
                <div
                  key={column.id}
                  role="columnheader"
                  className="text-2xs text-ink-faint truncate py-1.5 tracking-wide uppercase"
                >
                  {header}
                </div>
              );
            }

            return (
              <button
                key={column.id}
                type="button"
                role="columnheader"
                disabled={!sortEnabled}
                title={sortEnabled ? undefined : "Sorting needs a finished search"}
                onClick={() => onSortChange(active && descending ? sortKey : `-${sortKey}`)}
                className="text-2xs enabled:hover:text-ink flex items-center gap-1 truncate py-1.5 text-left tracking-wide uppercase disabled:cursor-not-allowed"
                style={{ color: active ? "var(--color-accent)" : undefined }}
              >
                <span className={active ? "" : "text-ink-faint"}>{header}</span>
                {active ? (
                  descending ? (
                    <ArrowDown className="size-3" />
                  ) : (
                    <ArrowUp className="size-3" />
                  )
                ) : null}
              </button>
            );
          })}
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 scrollbar-thin overflow-auto">
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = tableRows[virtualRow.index];
              if (!row) return null;
              return (
                <div
                  key={row.id}
                  role="row"
                  data-testid="result-row"
                  tabIndex={0}
                  onClick={() => router.push(`/sessions/${row.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") router.push(`/sessions/${row.id}`);
                  }}
                  className="border-line/50 hover:bg-surface-2 absolute inset-x-0 grid cursor-pointer items-center gap-2 border-b px-2"
                  style={{
                    height: virtualRow.size,
                    transform: `translateY(${String(virtualRow.start)}px)`,
                    gridTemplateColumns: templateColumns,
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div key={cell.id} role="gridcell" className="min-w-0 truncate">
                      <table.FlexRender cell={cell} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
