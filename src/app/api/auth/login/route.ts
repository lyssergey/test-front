import { NextResponse } from "next/server";
import { z } from "zod";

import { sessionCookieOptions } from "@/server/auth";
import { createSession } from "@/server/session-store";
import { login, LoginFailedError, UpstreamUnreachableError } from "@/server/upstream";

const LoginBody = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const parsed = LoginBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { code: "invalid_request", detail: "Email and password are required" },
      { status: 400 },
    );
  }

  try {
    const tokens = await login(parsed.data.email, parsed.data.password);
    const session = createSession(tokens);
    const response = NextResponse.json({ user: session.user });
    response.cookies.set({
      ...sessionCookieOptions(tokens.refresh_expires_in),
      value: session.id,
    });
    return response;
  } catch (error) {
    if (error instanceof LoginFailedError) {
      const body =
        typeof error.body === "object" && error.body !== null
          ? (error.body as Record<string, unknown>)
          : {};
      return NextResponse.json(
        {
          code: typeof body.code === "string" ? body.code : "login_failed",
          detail:
            typeof body.detail === "string" ? body.detail : "Could not sign in with those details",
          // An HTTP-date on this endpoint, unlike everywhere else.
          retry_after: error.retryAfter,
        },
        { status: error.status },
      );
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
