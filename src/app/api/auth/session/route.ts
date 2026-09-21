import { NextResponse } from "next/server";

import { currentSession } from "@/server/auth";

export async function GET() {
  const session = await currentSession();
  if (!session) {
    return NextResponse.json(
      { code: "not_authenticated", detail: "Sign in to continue" },
      { status: 401 },
    );
  }
  return NextResponse.json({ user: session.user });
}
