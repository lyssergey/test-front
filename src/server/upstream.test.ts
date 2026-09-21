import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile, TokenPair } from "@/lib/api/types";

import { createSession, getSession } from "./session-store";
import { SessionExpiredError, upstreamFetch, UpstreamUnreachableError } from "./upstream";

const USER: Profile = {
  id: "ana",
  email: "ana@quillmere.example",
  display_name: "Ana",
  role: "analyst",
  permissions: ["sessions:read"],
  sensor_ids: ["hq-core"],
};

function tokens(overrides: Partial<TokenPair> = {}): TokenPair {
  return {
    access_token: "at_1",
    token_type: "bearer",
    access_expires_in: 90,
    refresh_token: "rt_1",
    refresh_expires_in: 1800,
    user: USER,
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** An access token that is already past the refresh skew. */
function staleSession() {
  return createSession(tokens({ access_expires_in: 0 }));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

function calls(path: string): number {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path)).length;
}

describe("upstreamFetch", () => {
  it("refreshes before the access token expires and uses the new one", async () => {
    const session = staleSession();
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/v1/auth/refresh")
          ? json(tokens({ access_token: "at_2", refresh_token: "rt_2" }))
          : json({ ok: true }),
      ),
    );

    await upstreamFetch(session, { method: "GET", path: "/v1/sensors" });

    expect(calls("/v1/auth/refresh")).toBe(1);
    const sensorsCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/v1/sensors"));
    expect((sensorsCall![1] as RequestInit).headers).toMatchObject({
      authorization: "Bearer at_2",
    });
    expect(session.accessToken).toBe("at_2");
    expect(session.refreshToken).toBe("rt_2");
  });

  it("rotates only once for concurrent callers", async () => {
    // The upstream refresh token is single use with zero grace: a second,
    // parallel rotation would look like a replay and revoke the whole family.
    const session = staleSession();
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/v1/auth/refresh")
          ? json(tokens({ access_token: "at_2" }))
          : json({ ok: true }),
      ),
    );

    await Promise.all(
      Array.from({ length: 6 }, () =>
        upstreamFetch(session, { method: "GET", path: "/v1/sensors" }),
      ),
    );

    expect(calls("/v1/auth/refresh")).toBe(1);
    expect(calls("/v1/sensors")).toBe(6);
  });

  it("refreshes and retries once when a call comes back 401", async () => {
    const session = createSession(tokens());
    let sensorCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/auth/refresh"))
        return Promise.resolve(json(tokens({ access_token: "at_2" })));
      sensorCalls += 1;
      return Promise.resolve(
        sensorCalls === 1 ? json({ code: "token_expired" }, 401) : json({ ok: true }),
      );
    });

    const response = await upstreamFetch(session, { method: "GET", path: "/v1/sensors" });

    expect(response.status).toBe(200);
    expect(calls("/v1/auth/refresh")).toBe(1);
    expect(sensorCalls).toBe(2);
  });

  it("retries a buffered body but never replays a stream", async () => {
    const session = createSession(tokens());
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/v1/auth/refresh") ? json(tokens()) : json({ code: "token_expired" }, 401),
      ),
    );

    await upstreamFetch(session, {
      method: "POST",
      path: "/v1/searches",
      body: new Uint8Array([1, 2, 3]),
    });
    expect(calls("/v1/searches")).toBe(2);

    fetchMock.mockClear();
    await upstreamFetch(session, {
      method: "POST",
      path: "/v1/searches",
      body: new ReadableStream(),
    });
    expect(calls("/v1/searches")).toBe(1);
  });

  it("gives up and drops the session when the refresh itself fails", async () => {
    const session = staleSession();
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/v1/auth/refresh")
          ? json({ code: "refresh_reused" }, 401)
          : json({ ok: true }),
      ),
    );

    await expect(
      upstreamFetch(session, { method: "GET", path: "/v1/sensors" }),
    ).rejects.toBeInstanceOf(SessionExpiredError);
    expect(getSession(session.id)).toBeUndefined();
    expect(calls("/v1/sensors")).toBe(0);
  });

  it("reports an unreachable API as its own error", async () => {
    const session = createSession(tokens());
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      upstreamFetch(session, { method: "GET", path: "/v1/sensors" }),
    ).rejects.toBeInstanceOf(UpstreamUnreachableError);
  });
});

describe("session store", () => {
  it("forgets a session whose refresh token has idled out", () => {
    const session = createSession(tokens({ refresh_expires_in: 0 }));
    expect(getSession(session.id)).toBeUndefined();
  });

  it("hands out ids that do not look guessable", () => {
    const a = createSession(tokens());
    const b = createSession(tokens());
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
