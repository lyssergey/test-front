import type { FilterNode, SortKey } from "@/lib/api/types";

export interface SearchUrlState {
  sensors: string[];
  from: string;
  to: string;
  filter: FilterNode;
  sort: SortKey;
  /** Set on links meant to reproduce a result, so the search starts on open. */
  autoRun: boolean;
}

const SORT_KEYS: SortKey[] = ["ts", "-ts", "bytes", "-bytes", "risk", "-risk"];

function isSortKey(value: string | null): value is SortKey {
  return value !== null && (SORT_KEYS as string[]).includes(value);
}

function parseFilter(raw: string | null): FilterNode | null {
  if (raw === null || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed as FilterNode;
  } catch {
    // A hand-edited URL should not blank the screen; fall back to the default filter.
  }
  return null;
}

export function readSearchUrl(
  params: URLSearchParams,
  defaults: { sensors: string[]; from: string; to: string },
): SearchUrlState {
  const sensors = params.get("sensors")?.split(",").filter(Boolean);
  const sort = params.get("sort");

  return {
    sensors: sensors && sensors.length > 0 ? sensors : defaults.sensors,
    from: params.get("from") ?? defaults.from,
    to: params.get("to") ?? defaults.to,
    filter: parseFilter(params.get("q")) ?? { all: [] },
    sort: isSortKey(sort) ? sort : "-ts",
    autoRun: params.get("run") === "1",
  };
}

export function writeSearchUrl(state: Omit<SearchUrlState, "autoRun">, autoRun: boolean): string {
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
