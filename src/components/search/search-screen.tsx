"use client";

import { Link2, Play, Search as SearchIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  useColumns,
  useEstimate,
  useFields,
  useHealth,
  useHistogram,
  useSensors,
} from "@/lib/api/queries";
import {
  isTerminal,
  useCancelSearch,
  useCreateSearch,
  useSearchResults,
  useSearchStatus,
} from "@/lib/api/search";
import type { SortKey } from "@/lib/api/types";
import { useUser } from "@/lib/auth";
import {
  buildFilter,
  countConditions,
  draftFromFilter,
  type GroupDraft,
  toFilterRows,
} from "@/lib/filter";
import { formatNumber } from "@/lib/format";
import { readSearchUrl, writeSearchUrl } from "@/lib/search-url";
import { useDebounced } from "@/lib/use-debounced";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";

import { FilterBuilder } from "./filter-builder";
import { Histogram } from "./histogram";
import { JobProgress } from "./job-progress";
import { ResultsTable } from "./results-table";
import { SensorPicker } from "./sensor-picker";
import { TimeWindow } from "./time-window";

/** The order a running search serves its pages in. */
const SCAN_SORT: SortKey = "-ts";

/** Give back a search slot; there are only three per user. */
function freeSearch(searchId: string): void {
  void fetch(`/api/capture/v1/searches/${searchId}`, { method: "DELETE", keepalive: true });
}

function bucketSecondsFor(from: string, to: string): number {
  const spanSeconds = (new Date(to).getTime() - new Date(from).getTime()) / 1000;
  // Aim for roughly 120 buckets, inside the 60s-86400s the endpoint accepts.
  return Math.min(86_400, Math.max(60, Math.round(spanSeconds / 120 / 60) * 60 || 60));
}

export function SearchScreen() {
  const user = useUser();
  const router = useRouter();
  const params = useSearchParams();

  const health = useHealth();
  const sensorsQuery = useSensors();
  const fieldsQuery = useFields();
  const columnsQuery = useColumns();

  const captureNow = health.data?.server_time;
  const readableSensors = useMemo(
    () => (sensorsQuery.data ?? []).filter((sensor) => user.sensor_ids.includes(sensor.id)),
    [sensorsQuery.data, user.sensor_ids],
  );

  // The capture sits days behind the wall clock, so a window guessed from
  // `Date.now()` is outside every sensor's retention and the API rejects it.
  // Nothing is queried until /v1/health has said what "now" means here.
  const defaults = useMemo(() => {
    const end = captureNow ?? new Date().toISOString();
    const from = new Date(new Date(end).getTime() - 6 * 3_600_000).toISOString();
    return { sensors: user.sensor_ids.slice(0, 5), from, to: end };
  }, [captureNow, user.sensor_ids]);

  const url = useMemo(
    () => readSearchUrl(new URLSearchParams(params.toString()), defaults),
    [params, defaults],
  );
  const searchId = params.get("sid");

  // Both stay null until touched, so the defaults can follow the capture clock
  // as it arrives from /v1/health instead of being frozen by an effect.
  const [pickedSensors, setSensors] = useState<string[] | null>(
    params.get("sensors") === null ? null : url.sensors,
  );
  const [pickedWindow, setWindow] = useState<{ from: string; to: string } | null>(
    params.get("from") === null ? null : { from: url.from, to: url.to },
  );
  const [draft, setDraft] = useState<GroupDraft>(() => draftFromFilter(url.filter));
  const [sort, setSort] = useState<SortKey>(url.sort);
  const previousSearchRef = useRef<string | null>(null);

  const sensors = pickedSensors ?? defaults.sensors;
  const window = pickedWindow ?? { from: defaults.from, to: defaults.to };

  const fields = useMemo(() => fieldsQuery.data ?? [], [fieldsQuery.data]);
  const fieldMap = useMemo(() => new Map(fields.map((field) => [field.name, field])), [fields]);
  const built = useMemo(() => buildFilter(draft, fieldMap), [draft, fieldMap]);
  const filterRows = useMemo(() => toFilterRows(built.filter), [built.filter]);

  const windowIsReal = captureNow !== undefined || params.get("from") !== null;

  // The flag travels with the value: debounced on its own it would turn true
  // while the window it guards is still the one guessed from the wall clock.
  const debounced = useDebounced(
    useMemo(
      () => ({
        query: { from: window.from, to: window.to, sensors, rows: filterRows },
        real: windowIsReal,
      }),
      [window.from, window.to, sensors, filterRows, windowIsReal],
    ),
    450,
  );
  const windowQuery = debounced.query;
  const canQueryWindow = debounced.real && windowIsReal && sensors.length > 0;

  const estimate = useEstimate(windowQuery, canQueryWindow);
  const bucketSeconds = bucketSecondsFor(windowQuery.from, windowQuery.to);
  const histogram = useHistogram(windowQuery, bucketSeconds, canQueryWindow);

  const createSearch = useCreateSearch();
  const cancelSearch = useCancelSearch();
  const status = useSearchStatus(searchId);
  const searchDone = status.data?.state === "done";
  // A running search only serves its pages in scan order, whatever sort it was
  // created with, so the chosen order is applied once it has finished.
  const results = useSearchResults(searchId, searchDone && sort !== SCAN_SORT ? sort : null);

  const setSearchId = useCallback(
    (nextId: string | null, nextSort: SortKey = sort) => {
      const query = writeSearchUrl(
        { sensors, from: window.from, to: window.to, filter: built.filter, sort: nextSort },
        nextId !== null,
      );
      const suffix = nextId === null ? "" : `&sid=${nextId}`;
      router.replace(`/search?${query}${suffix}`, { scroll: false });
    },
    [built.filter, router, sensors, sort, window.from, window.to],
  );

  useEffect(() => {
    const previous = previousSearchRef.current;
    if (previous !== null && previous !== searchId) freeSearch(previous);
    previousSearchRef.current = searchId;
  }, [searchId]);

  // Leaving the page for good would otherwise hold one of the three slots until
  // it idles out. In-app navigation keeps it: the id is in the URL, so coming
  // back picks the same search up again.
  useEffect(() => {
    if (searchId === null) return;
    const release = () => {
      freeSearch(searchId);
    };
    globalThis.addEventListener("pagehide", release);
    return () => {
      globalThis.removeEventListener("pagehide", release);
    };
  }, [searchId]);

  const run = useCallback(() => {
    if (sensors.length === 0 || !windowIsReal) return;
    createSearch.mutate(
      // Created in scan order on purpose: that is the only order whose pages can
      // be read while the search is still running.
      {
        sensor_ids: sensors,
        from: window.from,
        to: window.to,
        filter: built.filter,
        sort: SCAN_SORT,
      },
      { onSuccess: (search) => setSearchId(search.id) },
    );
  }, [built.filter, createSearch, sensors, setSearchId, window.from, window.to, windowIsReal]);

  // A shared `run=1` link starts its search once the metadata it needs is in.
  const autoRunRef = useRef(false);
  useEffect(() => {
    if (autoRunRef.current || !url.autoRun || searchId !== null || !windowIsReal) return;
    if (fields.length === 0 || readableSensors.length === 0) return;
    autoRunRef.current = true;
    run();
  }, [fields.length, readableSensors.length, run, searchId, url.autoRun, windowIsReal]);

  const search = status.data;
  const searchRunning = search !== undefined && !isTerminal(search.state);
  const conditionCount = countConditions(draft);

  if (!windowIsReal && !health.isError) {
    return (
      <div className="space-y-2 p-2">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-16 w-full" />
        <p className="text-2xs text-ink-faint px-1">
          Reading the capture clock — every time window is relative to it, not to this computer.
        </p>
      </div>
    );
  }

  if (sensorsQuery.isError || fieldsQuery.isError || columnsQuery.isError) {
    return (
      <div className="p-4">
        <ErrorState
          error={sensorsQuery.error ?? fieldsQuery.error ?? columnsQuery.error}
          onRetry={() => {
            void sensorsQuery.refetch();
            void fieldsQuery.refetch();
            void columnsQuery.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <Card className="shrink-0">
        <CardHeader
          title="Query"
          aside={
            <div className="flex items-center gap-2">
              {estimate.data ? (
                <Badge
                  tone="info"
                  title="Estimated on a sample of the window, before any search runs"
                >
                  ≈{formatNumber(estimate.data.estimated_matches)} matches
                </Badge>
              ) : estimate.isFetching ? (
                <Spinner className="text-ink-faint size-3" />
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const query = writeSearchUrl(
                    { sensors, from: window.from, to: window.to, filter: built.filter, sort },
                    true,
                  );
                  void navigator.clipboard.writeText(`${location.origin}/search?${query}`);
                }}
                title="Copy a link that reproduces this search"
              >
                <Link2 className="size-3.5" /> Copy link
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={run}
                disabled={sensors.length === 0 || !windowIsReal || createSearch.isPending}
              >
                {createSearch.isPending ? <Spinner /> : <Play className="size-3" />}
                Run search
              </Button>
            </div>
          }
        />

        <div className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-3">
            {sensorsQuery.isLoading ? (
              <Skeleton className="h-7 w-40" />
            ) : (
              <SensorPicker
                sensors={readableSensors}
                selected={sensors}
                onChange={setSensors}
                disabled={searchRunning}
              />
            )}
            <TimeWindow
              from={window.from}
              to={window.to}
              captureNow={captureNow}
              onChange={setWindow}
              disabled={searchRunning}
            />
          </div>

          {fieldsQuery.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <FilterBuilder
              draft={draft}
              fields={fields}
              onChange={setDraft}
              disabled={searchRunning}
            />
          )}

          {built.skipped.length > 0 ? (
            <p className="text-2xs text-medium">
              {built.skipped.length} incomplete{" "}
              {built.skipped.length === 1 ? "condition is" : "conditions are"} not part of this
              search.
            </p>
          ) : null}

          {createSearch.error ? <ErrorState error={createSearch.error} /> : null}
        </div>
      </Card>

      <Card className="shrink-0">
        <Histogram
          data={histogram.data}
          from={windowQuery.from}
          to={windowQuery.to}
          loading={histogram.isFetching}
          {...(filterRows === null
            ? {
                unavailableReason:
                  "The timeline only takes AND-ed conditions, so it is hidden for this filter (any / not / nested groups).",
              }
            : {})}
          onPickWindow={setWindow}
        />
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {search ? (
          <JobProgress
            search={search}
            loadedRows={results.rows.length}
            matchedSoFar={results.matchedSoFar}
            phase={results.phase}
            canceling={cancelSearch.isPending}
            onCancel={() => {
              if (searchId) cancelSearch.mutate(searchId);
            }}
          />
        ) : null}

        {status.error ? (
          <div className="p-3">
            <ErrorState
              error={status.error}
              onRetry={status.error.status === 410 || status.error.status === 404 ? run : undefined}
            />
          </div>
        ) : null}

        {searchId === null ? (
          <EmptyState
            icon={<SearchIcon className="size-6" />}
            title="No search yet"
            hint={
              conditionCount === 0
                ? "Pick sensors and a window, then run the search. With no conditions it matches everything in the window."
                : `${String(conditionCount)} ${conditionCount === 1 ? "condition" : "conditions"} ready. Run the search to start scanning.`
            }
          />
        ) : results.error && results.rows.length === 0 ? (
          <div className="p-3">
            <ErrorState error={results.error} onRetry={run} />
          </div>
        ) : results.rows.length === 0 &&
          (results.phase === "complete" || search?.state === "done") ? (
          <EmptyState
            title="Nothing matched"
            hint="The search finished without a single match. Widen the window, or drop a condition."
          />
        ) : results.rows.length === 0 ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-7 w-full" />
            ))}
          </div>
        ) : (
          <ResultsTable
            rows={results.rows}
            columns={columnsQuery.data ?? []}
            sensors={sensorsQuery.data ?? []}
            sort={searchDone ? sort : SCAN_SORT}
            sortEnabled={searchDone}
            onSortChange={(nextSort) => {
              setSort(nextSort);
              setSearchId(searchId, nextSort);
            }}
            footer={
              <div className="text-2xs text-ink-faint flex items-center gap-2">
                <span className="tabular">
                  {formatNumber(results.rows.length)} of{" "}
                  {formatNumber(
                    Math.max(
                      results.matchedSoFar,
                      search?.progress.matched ?? 0,
                      results.rows.length,
                    ),
                  )}{" "}
                  rows
                </span>
                {results.phase === "caught-up" ? <Spinner className="size-3" /> : null}
                {results.atBudget ? (
                  <Button size="sm" variant="ghost" onClick={results.loadMore}>
                    Load more
                  </Button>
                ) : null}
                {results.error ? <span className="text-medium">{results.error.detail}</span> : null}
              </div>
            }
          />
        )}
      </Card>
    </div>
  );
}
