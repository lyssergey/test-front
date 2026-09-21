"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext } from "react";

import type { Permission, Profile } from "@/lib/api/types";

const UserContext = createContext<Profile | null>(null);

export function UserProvider({ user, children }: { user: Profile; children: ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser(): Profile {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser must be used inside UserProvider");
  return user;
}

export function useCan(permission: Permission): boolean {
  return useUser().permissions.includes(permission);
}

export class LoginError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(detail);
    this.name = "LoginError";
  }
}

export function useLogin() {
  const router = useRouter();

  return useMutation<Profile, LoginError, { email: string; password: string }>({
    mutationFn: async (credentials) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const body: unknown = await response.json().catch(() => null);
      const record = (body ?? {}) as Record<string, unknown>;

      if (!response.ok) {
        const retryAfter = record.retry_after;
        const seconds =
          typeof retryAfter === "string"
            ? Math.max(0, Math.round((Date.parse(retryAfter) - Date.now()) / 1000))
            : undefined;
        throw new LoginError(
          typeof record.code === "string" ? record.code : "login_failed",
          typeof record.detail === "string" ? record.detail : "Could not sign in",
          Number.isFinite(seconds) ? seconds : undefined,
        );
      }
      return record.user as Profile;
    },
    onSuccess: () => {
      router.replace("/search");
    },
  });
}

export function useLogout() {
  const router = useRouter();

  return useMutation({
    mutationFn: () => fetch("/api/auth/logout", { method: "POST" }),
    onSettled: () => {
      router.replace("/login");
    },
  });
}
