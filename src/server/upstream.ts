import type { TokenPair } from "@/lib/api/types";

import { env } from "./env";
import { applyTokens, destroySession, type SessionRecord } from "./session-store";

/** Unrecoverable: the caller must clear the cookie. */
export class SessionExpiredError extends Error {
  constructor(message = "Session expired") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

export class UpstreamUnreachableError extends Error {
  constructor(cause: unknown) {
    super("The Capture API is unreachable");
    this.name = "UpstreamUnreachableError";
    this.cause = cause;
  }
}

/** Refresh this many ms before the access token actually expires. */
const REFRESH_SKEW_MS = 5_000;

async function fetchUpstream(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${env.captureApiUrl}${path}`, { ...init, cache: "no-store" });
  } catch (cause) {
    throw new UpstreamUnreachableError(cause);
  }
}

export async function login(email: string, password: string): Promise<TokenPair> {
  const response = await fetchUpstream("/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new LoginFailedError(response.status, body, response.headers.get("retry-after"));
  }
  return (await response.json()) as TokenPair;
}

export class LoginFailedError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    /** On /v1/auth/login this is an HTTP-date, not seconds. */
    readonly retryAfter: string | null,
  ) {
    super("Login failed");
    this.name = "LoginFailedError";
  }
}

/** At most one rotation in flight: a consumed refresh token revokes the whole family. */
function refresh(record: SessionRecord): Promise<void> {
  record.refreshing ??= (async () => {
    try {
      const response = await fetchUpstream("/v1/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: record.refreshToken }),
      });
      if (!response.ok) {
        destroySession(record.id);
        throw new SessionExpiredError(`Refresh failed with ${String(response.status)}`);
      }
      applyTokens(record, (await response.json()) as TokenPair);
    } finally {
      delete record.refreshing;
    }
  })();
  return record.refreshing;
}

function isResendable(body: BodyInit | null | undefined): boolean {
  return (
    body == null ||
    typeof body === "string" ||
    body instanceof ArrayBuffer ||
    body instanceof Uint8Array
  );
}

export interface UpstreamRequest {
  method: string;
  path: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Calls the API for a session, keeping the access token fresh. Returns the raw Response. */
export async function upstreamFetch(
  record: SessionRecord,
  { method, path, body, headers, signal }: UpstreamRequest,
): Promise<Response> {
  if (record.accessExpiresAt - Date.now() <= REFRESH_SKEW_MS) {
    await refresh(record);
  }

  const send = (): Promise<Response> =>
    fetchUpstream(path, {
      method,
      body,
      headers: { ...headers, authorization: `Bearer ${record.accessToken}` },
      ...(signal ? { signal } : {}),
    });

  let response = await send();

  // The token may have been revoked, or expired between our check and the call.
  // Retrying means sending the body twice, which only works if it is buffered.
  if (response.status === 401 && isResendable(body)) {
    await refresh(record);
    response = await send();
  }

  return response;
}
