import { describe, expect, it } from "vitest";

import { isHexPreview, normalizeHeaders, normalizeHttp, requestLine } from "./http";

/** Shape the v2 decoder sends: header arrays, real numbers. */
const V2 = {
  http: {
    method: "GET",
    host: "prn-08",
    path: "/status.html",
    version: "HTTP/1.1",
    status: 200,
    request_headers: [
      { name: "Host", value: "prn-08" },
      { name: "User-Agent", value: "PrintMon/3.1" },
    ],
    response_headers: [{ name: "Server", value: "edge/1.24" }],
    request_body: { length: 0, content_type: "", preview: "", truncated: false },
    response_body: {
      length: 8302,
      content_type: "application/octet-stream",
      preview: "deadbeef".repeat(8),
      truncated: true,
    },
    user_agent: "PrintMon/3.1",
    file_ids: [],
    x_forwarded_for: "198.51.100.223",
  },
};

/** Shape the v1 decoder sends: header maps, stringified numbers, no `truncated`. */
const V1 = {
  http: {
    method: "GET",
    host: "ads.example.net",
    path: "/assets/logo.png",
    version: "HTTP/1.1",
    status: "200",
    request_headers: {
      Host: "ads.example.net",
      "User-Agent": "curl/8.6.0",
      Cookie: "sid=a1581900272efb5d",
    },
    response_headers: { Server: "edge/1.24", "Content-Length": "52844" },
    request_body: { length: "0", content_type: "", preview: "" },
    response_body: {
      length: "52844",
      content_type: "application/octet-stream",
      preview: "ab".repeat(16),
    },
    user_agent: "curl/8.6.0",
    file_ids: ["f-1"],
  },
};

describe("normalizeHeaders", () => {
  it("reads the v2 array form", () => {
    expect(normalizeHeaders([{ name: "A", value: "1" }])).toEqual([{ name: "A", value: "1" }]);
  });

  it("reads the v1 map form, keeping header order", () => {
    expect(normalizeHeaders({ A: "1", B: "2" })).toEqual([
      { name: "A", value: "1" },
      { name: "B", value: "2" },
    ]);
  });

  it("coerces non-string header values instead of dropping them", () => {
    expect(normalizeHeaders({ "Content-Length": 52844 })).toEqual([
      { name: "Content-Length", value: "52844" },
    ]);
  });

  it("returns an empty list for a missing or unusable value", () => {
    expect(normalizeHeaders(undefined)).toEqual([]);
    expect(normalizeHeaders("nonsense")).toEqual([]);
    expect(normalizeHeaders([{ value: "no name" }])).toEqual([]);
  });
});

describe("normalizeHttp", () => {
  it("produces the same shape from both decoder versions", () => {
    const v1 = normalizeHttp(V1)!;
    const v2 = normalizeHttp(V2)!;

    expect(v1.status).toBe(200);
    expect(v2.status).toBe(200);
    expect(typeof v1.status).toBe("number");
    expect(v1.requestHeaders).toHaveLength(3);
    expect(v2.requestHeaders).toHaveLength(2);
    expect(v1.responseBody.length).toBe(52844);
    expect(v2.responseBody.length).toBe(8302);
  });

  it("treats an absent `truncated` as unknown rather than false", () => {
    expect(normalizeHttp(V1)!.responseBody.truncated).toBeUndefined();
    expect(normalizeHttp(V2)!.responseBody.truncated).toBe(true);
  });

  it("drops empty content types and previews so the view can test for presence", () => {
    expect(normalizeHttp(V2)!.requestBody).toEqual({ length: 0, truncated: false });
  });

  it("collects keys the schema does not publish", () => {
    expect(normalizeHttp(V2)!.extras).toEqual([
      { name: "x_forwarded_for", value: "198.51.100.223" },
    ]);
    expect(normalizeHttp(V1)!.extras).toEqual([]);
  });

  it("falls back to the User-Agent header when `user_agent` is absent", () => {
    const decoded = { http: { request_headers: { "User-Agent": "wget/1.21" } } };
    expect(normalizeHttp(decoded)!.userAgent).toBe("wget/1.21");
  });

  it("returns null when the session carries no http payload", () => {
    expect(normalizeHttp({ dns: {} })).toBeNull();
  });

  it("keeps carved file ids", () => {
    expect(normalizeHttp(V1)!.fileIds).toEqual(["f-1"]);
  });
});

describe("requestLine", () => {
  it("survives a payload missing every part", () => {
    expect(requestLine(normalizeHttp({ http: {} })!)).toBe("? /");
    expect(requestLine(normalizeHttp(V1)!)).toBe("GET /assets/logo.png HTTP/1.1");
  });
});

describe("isHexPreview", () => {
  it("detects hex previews and leaves text alone", () => {
    expect(isHexPreview("ab".repeat(16))).toBe(true);
    expect(isHexPreview("GET / HTTP/1.1")).toBe(false);
    expect(isHexPreview("abc")).toBe(false);
  });
});
