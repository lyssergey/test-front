import { describe, expect, it } from "vitest";

import { isProxyAllowed } from "./proxy-allowlist";

describe("isProxyAllowed", () => {
  it("allows the read endpoints the UI uses", () => {
    expect(isProxyAllowed("GET", "v1/sensors")).toBe(true);
    expect(isProxyAllowed("GET", "v1/meta/schema/dns")).toBe(true);
    expect(isProxyAllowed("GET", "v1/searches/srch_abc/results")).toBe(true);
    expect(isProxyAllowed("GET", "v1/sessions/72057639335362590/pcap")).toBe(true);
    expect(isProxyAllowed("GET", "v1/sessions/1/files/f-2")).toBe(true);
  });

  it("allows starting, polling and cancelling a search", () => {
    expect(isProxyAllowed("POST", "v1/searches")).toBe(true);
    expect(isProxyAllowed("GET", "v1/searches/srch_abc")).toBe(true);
    expect(isProxyAllowed("DELETE", "v1/searches/srch_abc")).toBe(true);
  });

  it("refuses endpoints outside the UI's surface", () => {
    expect(isProxyAllowed("POST", "v1/cases")).toBe(false);
    expect(isProxyAllowed("POST", "v1/imports")).toBe(false);
    expect(isProxyAllowed("GET", "v1/hunts")).toBe(false);
    expect(isProxyAllowed("POST", "v1/auth/login")).toBe(false);
  });

  it("refuses a method the rule does not carry", () => {
    expect(isProxyAllowed("DELETE", "v1/sensors")).toBe(false);
    expect(isProxyAllowed("POST", "v1/searches/srch_abc")).toBe(false);
  });

  it("matches the whole path, so no prefix sneaks through", () => {
    expect(isProxyAllowed("GET", "v1/sensors/../auth/login")).toBe(false);
    expect(isProxyAllowed("GET", "v1/searches/a/b/results")).toBe(false);
    expect(isProxyAllowed("GET", "v1/sensorsX")).toBe(false);
  });

  it("is case-insensitive about the method only", () => {
    expect(isProxyAllowed("get", "v1/sensors")).toBe(true);
    expect(isProxyAllowed("GET", "V1/SENSORS")).toBe(false);
  });
});
