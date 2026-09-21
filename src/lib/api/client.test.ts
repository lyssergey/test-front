import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, captureFetch } from "./client";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

function respond(body: unknown, init: ResponseInit = {}): void {
  fetchMock.mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
      ...init,
    }),
  );
}

describe("captureFetch", () => {
  it("calls the app's proxy, never the API directly", async () => {
    respond({ items: [] });
    await captureFetch("v1/sensors");
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/capture/v1/sensors");
  });

  it("sends no authorization header of its own", async () => {
    respond({ items: [] });
    await captureFetch("v1/sensors");
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain("authorization");
  });

  it("returns undefined for 204 rather than failing to parse it", async () => {
    respond(undefined, { status: 204 });
    await expect(captureFetch("v1/searches/x")).resolves.toBeUndefined();
  });

  it("maps the error envelope onto code and detail", async () => {
    respond(
      { detail: "Search expired", code: "search_expired", search_id: "srch_1" },
      { status: 410 },
    );

    const error = await captureFetch("v1/searches/srch_1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 410,
      code: "search_expired",
      detail: "Search expired",
      context: { search_id: "srch_1" },
    });
  });

  it("handles FastAPI's 422, whose detail is a list and not a string", async () => {
    respond(
      { detail: [{ loc: ["body", "sensor_ids"], msg: "Field required", type: "missing" }] },
      { status: 422 },
    );

    const error = (await captureFetch("v1/searches").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("validation_error");
    expect(error.detail).toBe("body.sensor_ids: Field required");
    expect(error.issues).toHaveLength(1);
  });

  it("reads Retry-After as seconds", async () => {
    respond(
      { detail: "Slow down", code: "rate_limited" },
      { status: 429, headers: { "retry-after": "30" } },
    );
    const error = (await captureFetch("v1/estimate").catch((e: unknown) => e)) as ApiError;
    expect(error.retryAfterSeconds).toBe(30);
  });

  it("reads Retry-After as an HTTP-date, which /v1/auth/login sends", async () => {
    const at = new Date(Date.now() + 45_000).toUTCString();
    respond(
      { detail: "Too many attempts", code: "login_rate_limited" },
      { status: 429, headers: { "retry-after": at } },
    );
    const error = (await captureFetch("v1/x").catch((e: unknown) => e)) as ApiError;
    expect(error.retryAfterSeconds).toBeGreaterThanOrEqual(43);
    expect(error.retryAfterSeconds).toBeLessThanOrEqual(46);
  });

  it("still produces an ApiError when the body is not JSON at all", async () => {
    fetchMock.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));
    const error = (await captureFetch("v1/sensors").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("http_error");
    expect(error.status).toBe(502);
  });

  it("flags a 401 so the app can send the user back to sign-in", async () => {
    respond({ detail: "Sign in to continue", code: "not_authenticated" }, { status: 401 });
    const error = (await captureFetch("v1/me").catch((e: unknown) => e)) as ApiError;
    expect(error.isAuthError).toBe(true);
  });
});
