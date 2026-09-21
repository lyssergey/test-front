import { describe, expect, it } from "vitest";

import { readSearchUrl, writeSearchUrl } from "./search-url";

function read(query: string) {
  return readSearchUrl(new URLSearchParams(query));
}

describe("readSearchUrl", () => {
  it("reads a complete window", () => {
    const state = read("from=2025-10-27T09:00:00.000Z&to=2025-10-27T12:00:00.000Z");
    expect(state.window).toEqual({
      from: "2025-10-27T09:00:00.000Z",
      to: "2025-10-27T12:00:00.000Z",
    });
  });

  it("ignores half a window, so nothing is filled in from the clock", () => {
    // A bound completed from `Date.now()` would render a different value on the
    // server pass than on the first client render — a hydration mismatch.
    expect(read("from=2025-10-27T09:00:00.000Z").window).toBeNull();
    expect(read("to=2025-10-27T12:00:00.000Z").window).toBeNull();
    expect(read("").window).toBeNull();
  });

  it("leaves sensors null when the URL says nothing", () => {
    expect(read("").sensors).toBeNull();
    expect(read("sensors=").sensors).toBeNull();
    expect(read("sensors=hq-core,dc-east").sensors).toEqual(["hq-core", "dc-east"]);
  });

  it("falls back to the scan order for a missing or bogus sort", () => {
    expect(read("").sort).toBe("-ts");
    expect(read("sort=sideways").sort).toBe("-ts");
    expect(read("sort=risk").sort).toBe("risk");
  });

  it("survives a hand-mangled filter instead of blanking the screen", () => {
    expect(read("q=not-json").filter).toEqual({ all: [] });
    // `typeof [] === "object"`, so an array has to be rejected explicitly.
    expect(read("q=%5B1%2C2%5D").filter).toEqual({ all: [] });
    expect(read("q=%7B%22nonsense%22%3A1%7D").filter).toEqual({ all: [] });
    expect(read("q=42").filter).toEqual({ all: [] });
    expect(
      read(`q=${encodeURIComponent('{"field":"protocol","op":"eq","value":"dns"}')}`).filter,
    ).toEqual({
      field: "protocol",
      op: "eq",
      value: "dns",
    });
  });

  it("only auto-runs when the link says so", () => {
    expect(read("").autoRun).toBe(false);
    expect(read("run=1").autoRun).toBe(true);
  });
});

describe("writeSearchUrl", () => {
  const state = {
    sensors: ["hq-core"],
    from: "2025-10-27T09:00:00.000Z",
    to: "2025-10-27T12:00:00.000Z",
    filter: { field: "protocol", op: "eq" as const, value: "dns" },
    sort: "-ts" as const,
  };

  it("always writes both bounds, so a generated link is never half a window", () => {
    const written = read(writeSearchUrl(state, false));
    expect(written.window).toEqual({ from: state.from, to: state.to });
  });

  it("round-trips through readSearchUrl", () => {
    const written = read(writeSearchUrl(state, true));
    expect(written.sensors).toEqual(state.sensors);
    expect(written.filter).toEqual(state.filter);
    expect(written.sort).toBe(state.sort);
    expect(written.autoRun).toBe(true);
  });

  it("leaves an empty filter out of the URL", () => {
    expect(writeSearchUrl({ ...state, filter: { all: [] } }, false)).not.toContain("q=");
  });
});
