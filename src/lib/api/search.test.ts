import { act, renderHook } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ClientModule from "./client";
import { ApiError, captureFetch } from "./client";
import { isTerminal, newIdempotencyKey, useSearchResults } from "./search";
import type { SearchResults, SessionRow, SortKey } from "./types";

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof ClientModule>();
  return { ...actual, captureFetch: vi.fn() };
});

const fetchMock = captureFetch as unknown as Mock;

function row(id: string): SessionRow {
  return {
    id,
    sensor_id: "hq-core",
    start: "2025-10-27T11:00:00.000Z",
    end: "2025-10-27T11:00:01.000Z",
    duration_ms: 1000,
    protocol: "tls",
    transport: "tcp",
    src: { ip: "10.0.0.1", port: 1234 },
    dst: { ip: "10.0.0.2", port: 443 },
    bytes: { up: 1, down: 2 },
    packets: { up: 1, down: 1 },
    risk: { score: 1, band: "low", reasons: [] },
    summary: "s",
    decoder: "tls/2",
    files_count: 0,
    pcap_available: true,
  };
}

function page(ids: string[], next: string | null, complete: boolean): SearchResults {
  return { items: ids.map(row), next_cursor: next, complete, matched_so_far: ids.length };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSearchResults", () => {
  it("does nothing until there is a search", () => {
    const { result } = renderHook(() => useSearchResults(null, "-ts"));
    expect(result.current.phase).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows the cursor and stops when the search says it is complete", async () => {
    fetchMock
      .mockResolvedValueOnce(page(["1", "2"], "c1", false))
      .mockResolvedValueOnce(page(["3"], null, true));

    const { result } = renderHook(() => useSearchResults("srch_1", null));

    await vi.waitFor(() => {
      expect(result.current.phase).toBe("complete");
    });
    expect(result.current.rows.map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toContain("cursor=c1");
  });

  it("waits and asks the same window again when it has caught up", async () => {
    // `next_cursor: null` with `complete: false` is upstream's "nothing more yet",
    // and the re-read answers with that window grown, not with the rows after it.
    fetchMock
      .mockResolvedValueOnce(page(["1"], null, false))
      .mockResolvedValueOnce(page(["1", "2"], null, true));

    const { result } = renderHook(() => useSearchResults("srch_1", null));

    await vi.waitFor(() => {
      expect(result.current.phase).toBe("caught-up");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    await vi.waitFor(() => {
      expect(result.current.phase).toBe("complete");
    });
    // The grown window replaces the one it grew from, so row 1 appears once.
    expect(result.current.rows.map((r) => r.id)).toEqual(["1", "2"]);
    expect(fetchMock.mock.calls[1]![0]).not.toContain("cursor=");
  });

  it("keeps earlier pages when the tail it re-reads grows", async () => {
    fetchMock
      .mockResolvedValueOnce(page(["1", "2"], "c1", false))
      .mockResolvedValueOnce(page(["3"], null, false))
      .mockResolvedValueOnce(page(["3", "4"], null, true));

    const { result } = renderHook(() => useSearchResults("srch_1", null));

    await vi.waitFor(() => {
      expect(result.current.phase).toBe("caught-up");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    await vi.waitFor(() => {
      expect(result.current.phase).toBe("complete");
    });
    expect(result.current.rows.map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
    expect(fetchMock.mock.calls[2]![0]).toContain("cursor=c1");
  });

  it("leaves sort out while the search runs, since its pages have one order already", async () => {
    fetchMock.mockResolvedValue(page(["1"], null, true));
    renderHook(() => useSearchResults("srch_1", null));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(fetchMock.mock.calls[0]![0]).toBe("v1/searches/srch_1/results?limit=200");
  });

  it("asks for a sort only once the user re-sorts a finished search", async () => {
    fetchMock.mockResolvedValue(page(["1"], null, true));
    renderHook(() => useSearchResults("srch_1", "risk"));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(fetchMock.mock.calls[0]![0]).toBe("v1/searches/srch_1/results?limit=200&sort=risk");
  });

  it("marks an expired search apart from other failures", async () => {
    fetchMock.mockRejectedValue(
      new ApiError({ status: 410, code: "search_expired", detail: "Search expired" }),
    );

    const { result } = renderHook(() => useSearchResults("srch_1", "-ts"));

    await vi.waitFor(() => {
      expect(result.current.phase).toBe("expired");
    });
    expect(result.current.error?.code).toBe("search_expired");
  });

  it("reports any other failure as an error and stops asking", async () => {
    fetchMock.mockRejectedValue(
      new ApiError({ status: 500, code: "internal", detail: "Upstream blew up" }),
    );

    const { result } = renderHook(() => useSearchResults("srch_1", "-ts"));

    await vi.waitFor(() => {
      expect(result.current.phase).toBe("error");
    });
    const callCount = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fetchMock.mock.calls.length).toBe(callCount);
  });

  it("starts over from the first page when the sort changes", async () => {
    fetchMock.mockResolvedValue(page(["1"], null, true));
    const { result, rerender } = renderHook(
      ({ sort }: { sort: SortKey | null }) => useSearchResults("srch_1", sort),
      { initialProps: { sort: null as SortKey | null } },
    );

    await vi.waitFor(() => {
      expect(result.current.phase).toBe("complete");
    });

    fetchMock.mockResolvedValue(page(["9"], null, true));
    rerender({ sort: "-risk" });

    await vi.waitFor(() => {
      expect(result.current.rows.map((r) => r.id)).toEqual(["9"]);
    });
    expect(fetchMock.mock.calls.at(-1)![0]).toContain("sort=-risk");
  });

  it("does not stack the same page twice when the effect runs again", async () => {
    // React's development double-mount runs the paging loop twice for one search.
    fetchMock.mockResolvedValue(page(["1", "2"], null, true));
    const { result } = renderHook(() => useSearchResults("srch_1", null), {
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    });

    await vi.waitFor(() => {
      expect(result.current.phase).toBe("complete");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.rows.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("stops fetching once the component goes away", async () => {
    fetchMock.mockResolvedValue(page(["1"], "c1", false));
    const { unmount } = renderHook(() => useSearchResults("srch_1", "-ts"));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    unmount();
    const callCount = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(callCount + 1);
  });
});

describe("isTerminal", () => {
  it("knows which states stop the poll", () => {
    expect(isTerminal("queued")).toBe(false);
    expect(isTerminal("running")).toBe(false);
    expect(isTerminal("done")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
  });
});

describe("newIdempotencyKey", () => {
  it("fits the 8-64 characters of [A-Za-z0-9_-] the API demands", () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(key).not.toBe(newIdempotencyKey());
  });
});
