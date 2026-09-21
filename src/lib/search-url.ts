import type { FilterNode, SortKey } from "@/lib/api/types";

export interface SearchUrlState {
  /** null when the URL says nothing, so the caller supplies its own default. */
  sensors: string[] | null;
  /** Both bounds or neither: one filled in from the clock would render a render-time value. */
  window: { from: string; to: string } | null;
  filter: FilterNode;
  sort: SortKey;
  /** Set on links meant to reproduce a result, so the search starts on open. */
  autoRun: boolean;
}

const SORT_KEYS: SortKey[] = ["ts", "-ts", "bytes", "-bytes", "risk", "-risk"];

function isSortKey(value: string | null): value is SortKey {
  return value !== null && (SORT_KEYS as string[]).includes(value);
}

/** A filter node, loosely: enough to keep a hand-mangled URL out of the API. */
function looksLikeNode(value: unknown): value is FilterNode {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const node = value as Record<string, unknown>;
  return "all" in node || "any" in node || "not" in node || "field" in node;
}

function parseFilter(raw: string | null): FilterNode | null {
  if (raw === null || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (looksLikeNode(parsed)) return parsed;
  } catch {
    // A hand-edited URL should not blank the screen; fall back to the default filter.
  }
  return null;
}

export function readSearchUrl(params: URLSearchParams): SearchUrlState {
  const sensors = params.get("sensors")?.split(",").filter(Boolean);
  const from = params.get("from");
  const to = params.get("to");
  const sort = params.get("sort");

  return {
    sensors: sensors && sensors.length > 0 ? sensors : null,
    window: from !== null && to !== null ? { from, to } : null,
    filter: parseFilter(params.get("q")) ?? { all: [] },
    sort: isSortKey(sort) ? sort : "-ts",
    autoRun: params.get("run") === "1",
  };
}

export function writeSearchUrl(
  state: { sensors: string[]; from: string; to: string; filter: FilterNode; sort: SortKey },
  autoRun: boolean,
): string {
  const params = new URLSearchParams({
    sensors: state.sensors.join(","),
    from: state.from,
    to: state.to,
    sort: state.sort,
  });
  const hasFilter = !("all" in state.filter && state.filter.all.length === 0);
  if (hasFilter) params.set("q", JSON.stringify(state.filter));
  if (autoRun) params.set("run", "1");
  return params.toString();
}
