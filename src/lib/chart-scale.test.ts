import { describe, expect, it } from "vitest";

import { barHeight } from "./chart-scale";

const MAX = 60;

describe("barHeight", () => {
  it("gives the peak the full height", () => {
    expect(barHeight(259, 259, MAX)).toBe(MAX);
  });

  it("gives nothing height zero, so an empty bucket draws nothing", () => {
    expect(barHeight(0, 259, MAX)).toBe(0);
  });

  it("keeps a small bucket visible where a linear scale would not", () => {
    // The real case: one bucket of 259 against typical buckets of ~20.
    const linear = (20 / 259) * MAX;
    const sqrt = barHeight(20, 259, MAX);
    expect(sqrt).toBeGreaterThan(linear);
    expect(sqrt).toBeGreaterThan(MAX / 4);
  });

  it("never draws a counted bucket as nothing", () => {
    // 1 of 100000 is 0.0006 px on a linear scale — invisible.
    expect(barHeight(1, 100_000, MAX)).toBeGreaterThanOrEqual(1);
  });

  it("stays monotonic, so a taller bar always means more sessions", () => {
    const heights = [1, 5, 20, 50, 120, 259].map((value) => barHeight(value, 259, MAX));
    for (let i = 1; i < heights.length; i += 1) {
      expect(heights[i]!).toBeGreaterThanOrEqual(heights[i - 1]!);
    }
  });

  it("puts a quarter of the peak at half the height, which is what a root scale means", () => {
    expect(barHeight(64, 256, MAX)).toBeCloseTo(MAX / 2, 6);
  });

  it("clamps a value above the peak instead of overflowing the chart", () => {
    expect(barHeight(400, 259, MAX)).toBe(MAX);
  });

  it("guards against a zero or negative scale", () => {
    expect(barHeight(10, 0, MAX)).toBe(0);
    expect(barHeight(-5, 259, MAX)).toBe(0);
    expect(barHeight(10, 259, 0)).toBe(0);
  });
});
