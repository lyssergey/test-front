"use client";

import { LogOut, Radar } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { useHealth } from "@/lib/api/queries";
import { useLogout, useUser } from "@/lib/auth";
import { formatTimestamp } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  const user = useUser();
  const logout = useLogout();
  const health = useHealth();

  return (
    <div className="flex h-dvh flex-col">
      <header className="border-line bg-surface flex shrink-0 items-center gap-3 border-b px-3 py-2">
        <Link href="/search" className="text-ink hover:text-accent flex items-center gap-2">
          <Radar className="text-accent size-4" />
          <span className="text-sm font-medium">Capture</span>
        </Link>

        <div className="ml-2 flex items-center gap-2">
          {health.data ? (
            <>
              <Badge tone={health.data.status === "ok" ? "low" : "medium"}>
                API {health.data.status}
              </Badge>
              <span
                className="tabular text-2xs text-ink-faint"
                title="The capture clock — every time window is relative to this, not your computer's clock"
              >
                capture clock {formatTimestamp(health.data.server_time)}Z
              </span>
            </>
          ) : health.isError ? (
            <Badge tone="high">API unreachable</Badge>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="text-ink text-xs">{user.display_name}</div>
            <div className="text-2xs text-ink-faint">
              {user.role} · {user.sensor_ids.length} sensors
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            aria-label="Sign out"
          >
            <LogOut className="size-3.5" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
