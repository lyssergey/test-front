import { cookies } from "next/headers";

import { env } from "./env";
import { getSession, type SessionRecord } from "./session-store";

export async function currentSession(): Promise<SessionRecord | undefined> {
  return getSession((await cookies()).get(env.sessionCookie)?.value);
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    name: env.sessionCookie,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.isProduction,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
