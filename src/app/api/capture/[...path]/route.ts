import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { env } from "@/server/env";
import { isProxyAllowed } from "@/server/proxy-allowlist";
import { getSession } from "@/server/session-store";
import { SessionExpiredError, upstreamFetch, UpstreamUnreachableError } from "@/server/upstream";

// The only door from the browser to the Capture API: adds the bearer token, streams the reply.

/** Note the absence of `authorization`. */
const FORWARD_REQUEST_HEADERS = ["content-type", "accept", "idempotency-key", "if-none-match"];

const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "content-length",
  "etag",
  "retry-after",
  "x-limit-applied",
  "idempotent-replayed",
  "location",
];

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
  const path = segments.join("/");

  if (!isProxyAllowed(request.method, path)) {
    return NextResponse.json(
      { code: "proxy_forbidden", detail: `${request.method} /${path} is not proxied` },
      { status: 403 },
    );
  }

  const sessionId = (await cookies()).get(env.sessionCookie)?.value;
  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { code: "not_authenticated", detail: "Sign in to continue" },
      { status: 401 },
    );
  }

  const headers: Record<string, string> = {};
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers[name] = value;
  }

  // Buffered, not streamed: a token refresh may force a replay. All bodies here are small.
  const body =
    request.method === "GET" || request.method === "DELETE"
      ? null
      : new Uint8Array(await request.arrayBuffer());

  const search = new URL(request.url).search;

  try {
    const upstream = await upstreamFetch(session, {
      method: request.method,
      path: `/${path}${search}`,
      body,
      headers,
      signal: request.signal,
    });

    const responseHeaders = new Headers();
    for (const name of FORWARD_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }
    responseHeaders.set("cache-control", "no-store");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      const response = NextResponse.json(
        { code: "session_expired", detail: "Your session has expired. Sign in again." },
        { status: 401 },
      );
      response.cookies.delete(env.sessionCookie);
      return response;
    }
    if (error instanceof UpstreamUnreachableError) {
      return NextResponse.json(
        { code: "upstream_unreachable", detail: "The Capture API is not responding" },
        { status: 502 },
      );
    }
    throw error;
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const PATCH = handle;
