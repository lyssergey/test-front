"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, captureFetch, isApiError } from "./client";
import type { Search, SearchCreate, SearchResults, SessionRow, SortKey } from "./types";

const PAGE_LIMIT = 200;
/** Rows fetched before the table stops following on its own. */
const AUTO_LOAD_BUDGET = 2_000;
/** `next_cursor: null` with `complete: false` means caught up — wait, then ask again. */
const CAUGHT_UP_DELAY_MS = 700;

export function newIdempotencyKey(): string {
  // Upstream requires 8-64 characters of [A-Za-z0-9_-].
  return `ui-${crypto.randomUUID().replaceAll("-", "")}`;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export function isTerminal(state: Search["state"]): boolean {
  return state === "done" || state === "failed" || state === "cancelled";
}

export function useCreateSearch() {
  return useMutation<Search, ApiError, SearchCreate>({
    mutationFn: (input) =>
      captureFetch<Search>("v1/searches", {
        method: "POST",
        body: input,
        headers: { "idempotency-key": newIdempotencyKey() },
      }),
    retry: false,
  });
}

/** Polls the job while it runs. A search nobody reads for 10 minutes is discarded upstream. */
export function useSearchStatus(searchId: string | null) {
  return useQuery<Search, ApiError>({
    queryKey: ["search", searchId],
    queryFn: () => captureFetch<Search>(`v1/searches/${searchId!}`),
    enabled: searchId !== null,
    refetchInterval: (query) => {
      const search = query.state.data;
      if (!search) return 500;
      return isTerminal(search.state) ? false : 600;
    },
    retry: false,
    gcTime: 0,
  });
}

export function useCancelSearch() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (searchId) => captureFetch<void>(`v1/searches/${searchId}`, { method: "DELETE" }),
    onSettled: (_data, _error, searchId) => {
      void queryClient.invalidateQueries({ queryKey: ["search", searchId] });
    },
  });
}

export type ResultsPhase =
  "idle" | "loading" | "caught-up" | "paused" | "complete" | "error" | "expired";

export interface ResultsState {
  rows: SessionRow[];
  matchedSoFar: number;
  phase: ResultsPhase;
  error: ApiError | null;
  /** True once the table stopped following because it hit the auto-load budget. */
  atBudget: boolean;
}

const IDLE: ResultsState = {
  rows: [],
  matchedSoFar: 0,
  phase: "idle",
  error: null,
  atBudget: false,
};

/** State is stamped with the run it belongs to, so a new run is derived, not reset by an effect. */
interface KeyedResults extends ResultsState {
  key: string;
}

/**
 * Streams a search's pages while it runs.
 *
 * Upstream hands out rows in scan order as they are found, so this keeps asking:
 * a cursor means another page is ready, no cursor with `complete: false` means
 * the search has not caught up yet, and `complete: true` is the end.
 *
 * `sortOverride` is only for re-sorting a search that has finished. The pages of
 * a running search come back in its own scan order, and asking for another one
 * is a 409 — so it stays out of the query string until the user re-sorts.
 */
export function useSearchResults(searchId: string | null, sortOverride: SortKey | null) {
  const runKey = searchId === null ? "" : `${searchId}|${sortOverride ?? ""}`;
  const [state, setState] = useState<KeyedResults>({ ...IDLE, key: "" });
  const budgetRef = useRef(AUTO_LOAD_BUDGET);
  const gateRef = useRef<ReturnType<typeof deferred> | null>(null);

  const current: ResultsState =
    state.key === runKey ? state : { ...IDLE, phase: searchId === null ? "idle" : "loading" };

  const openGate = useCallback(() => {
    gateRef.current?.resolve();
    gateRef.current = null;
  }, []);

  const loadMore = useCallback(() => {
    budgetRef.current += AUTO_LOAD_BUDGET;
    openGate();
  }, [openGate]);

  useEffect(() => {
    if (searchId === null) return;

    const controller = new AbortController();
    const { signal } = controller;
    budgetRef.current = AUTO_LOAD_BUDGET;

    // Pages are kept separately, keyed by the cursor that produced them, because
    // re-reading the tail of a running search answers with that same window plus
    // whatever has been found since — a superset, not the rows after it.
    const pages: { cursor: string | null; rows: SessionRow[] }[] = [];
    let cursor: string | null = null;
    const rowCount = () => pages.reduce((total, page) => total + page.rows.length, 0);

    const run = async () => {
      while (!signal.aborted) {
        if (rowCount() >= budgetRef.current) {
          setState((previous) => ({ ...previous, key: runKey, phase: "paused", atBudget: true }));
          gateRef.current ??= deferred();
          signal.addEventListener("abort", openGate, { once: true });
          await gateRef.current.promise;
          continue;
        }

        const query = new URLSearchParams({ limit: String(PAGE_LIMIT) });
        if (sortOverride !== null) query.set("sort", sortOverride);
        if (cursor !== null) query.set("cursor", cursor);

        let page: SearchResults;
        try {
          page = await captureFetch<SearchResults>(
            `v1/searches/${searchId}/results?${query.toString()}`,
            { signal },
          );
        } catch (error) {
          if (signal.aborted) return;
          const apiError = isApiError(error)
            ? error
            : new ApiError({ status: 0, code: "network_error", detail: "Could not load results" });
          setState((previous) => ({
            ...(previous.key === runKey ? previous : { ...IDLE, key: runKey }),
            phase: apiError.status === 410 ? "expired" : "error",
            error: apiError,
          }));
          return;
        }
        if (signal.aborted) return;

        const requestedCursor = cursor;
        const existing = pages.findIndex((entry) => entry.cursor === requestedCursor);
        if (existing === -1) pages.push({ cursor: requestedCursor, rows: page.items });
        else pages[existing]!.rows = page.items;

        const phase: ResultsPhase = page.complete
          ? "complete"
          : page.next_cursor !== null
            ? "loading"
            : "caught-up";

        setState({
          key: runKey,
          rows: pages.flatMap((entry) => entry.rows),
          matchedSoFar: page.matched_so_far,
          phase,
          error: null,
          atBudget: false,
        });

        if (page.complete) return;
        if (page.next_cursor !== null) {
          cursor = page.next_cursor;
        } else {
          // Caught up: ask the same window again in a moment, not the next one.
          await sleep(CAUGHT_UP_DELAY_MS, signal);
        }
      }
    };

    void run();
    return () => {
      controller.abort();
      openGate();
    };
  }, [searchId, sortOverride, runKey, openGate]);

  return { ...current, loadMore };
}
