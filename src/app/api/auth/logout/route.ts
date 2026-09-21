import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { env } from "@/server/env";
import { destroySession, getSession } from "@/server/session-store";
import { upstreamFetch } from "@/server/upstream";

export async function POST() {
  const jar = await cookies();
  const id = jar.get(env.sessionCookie)?.value;
  const session = getSession(id);

  if (session) {
    // Best effort: the local session goes either way.
    await upstreamFetch(session, { method: "POST", path: "/v1/auth/logout" }).catch(() => null);
  }
  destroySession(id);

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(env.sessionCookie);
  return response;
}
