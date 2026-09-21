import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatDuration,
  formatEndpoint,
  formatIsoForInput,
  formatTimestamp,
  parseInputToIso,
} from "./format";

describe("formatIsoForInput / parseInputToIso", () => {
  it("keeps the seconds, so a sub-minute window is visible and editable", () => {
    expect(formatIsoForInput("2025-10-27T11:03:37.000Z")).toBe("2025-10-27T11:03:37");
  });

  it("round-trips an instant through the control's value", () => {
    const iso = "2025-10-27T11:03:37.000Z";
    expect(parseInputToIso(formatIsoForInput(iso))).toBe(iso);
  });

  it("accepts the minute-only value the control gives when seconds are zero", () => {
    expect(parseInputToIso("2025-10-27T11:03")).toBe("2025-10-27T11:03:00.000Z");
  });

  it("reads the value as UTC, not as the browser's local time", () => {
    expect(parseInputToIso("2025-10-27T11:03:37")).toBe("2025-10-27T11:03:37.000Z");
  });

  it("returns null for an empty or unparseable value instead of an Invalid Date", () => {
    expect(parseInputToIso("")).toBeNull();
    expect(parseInputToIso("not-a-date")).toBeNull();
    expect(formatIsoForInput("nonsense")).toBe("");
  });
});

describe("formatTimestamp", () => {
  it("shows UTC, since three sensors sit in three local zones", () => {
    expect(formatTimestamp("2025-10-27T11:03:37.412Z")).toBe("2025-10-27 11:03:37");
    expect(formatTimestamp("2025-10-27T11:03:37.412Z", { millis: true })).toBe(
      "2025-10-27 11:03:37.412",
    );
  });

  it("hands back an unparseable input untouched rather than showing Invalid Date", () => {
    expect(formatTimestamp("27/10/2025 12:00")).toBe("27/10/2025 12:00");
  });
});

describe("formatDuration", () => {
  it("scales the unit to the magnitude", () => {
    expect(formatDuration(527)).toMatch(/^527\sms$/u);
    expect(formatDuration(4120)).toMatch(/^4\.12\ss$/u);
    expect(formatDuration(95_000)).toMatch(/^1m\s35s$/u);
  });

  it("marks a negative duration rather than hiding it", () => {
    // A handful of upstream sessions really do end before they start.
    expect(formatDuration(-527)).toContain("−");
  });
});

describe("formatBytes", () => {
  it("switches unit at 1024 and keeps one decimal only while it helps", () => {
    expect(formatBytes(512)).toMatch(/^512\sB$/u);
    expect(formatBytes(2048)).toMatch(/^2\.0\skB$/u);
    expect(formatBytes(20_063)).toMatch(/^20\skB$/u);
  });
});

describe("formatEndpoint", () => {
  it("brackets an IPv6 address so the port stays readable", () => {
    expect(formatEndpoint("10.20.4.18", 443)).toBe("10.20.4.18:443");
    expect(formatEndpoint("2001:db8:20:4::5a", 443)).toBe("[2001:db8:20:4::5a]:443");
  });
});
