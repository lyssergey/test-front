"use client";

import { Radar } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { useLogin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const DEMO_ACCOUNTS = [
  { email: "ana@quillmere.example", password: "demo-analyst", role: "analyst, sees everything" },
  {
    email: "oli@quillmere.example",
    password: "demo-observer",
    role: "read-only, some data hidden",
  },
];

export function LoginForm() {
  const login = useLogin();
  const expired = useSearchParams().get("expired") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <Radar className="text-accent size-5" />
          <h1 className="text-lg font-medium">Capture</h1>
        </div>

        {expired ? (
          <p className="border-medium/40 bg-medium/10 text-medium mb-4 rounded border px-3 py-2 text-xs">
            Your session expired. Sign in again.
          </p>
        ) : null}

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate({ email, password });
          }}
        >
          <label className="block space-y-1">
            <span className="text-ink-muted text-xs">Email</span>
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-9 w-full"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-ink-muted text-xs">Password</span>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-9 w-full"
            />
          </label>

          {login.error ? (
            <p
              role="alert"
              className="border-high/40 bg-high/10 text-high rounded border px-3 py-2 text-xs"
            >
              {login.error.detail}
              {login.error.retryAfterSeconds !== undefined
                ? ` Try again in about ${String(login.error.retryAfterSeconds)}s.`
                : null}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            disabled={login.isPending || login.isSuccess}
            className="w-full"
          >
            {login.isPending ? <Spinner /> : null}
            {login.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="border-line mt-8 space-y-2 border-t pt-4">
          <p className="text-2xs text-ink-faint tracking-wide uppercase">Demo accounts</p>
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => {
                setEmail(account.email);
                setPassword(account.password);
              }}
              className="border-line bg-surface hover:border-line-strong block w-full rounded border px-2.5 py-2 text-left"
            >
              <span className="text-ink font-mono text-xs">{account.email}</span>
              <span className="text-2xs text-ink-faint block">{account.role}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
