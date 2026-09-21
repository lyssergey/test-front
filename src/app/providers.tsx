"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { isApiError } from "@/lib/api/client";

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // 4xx will not fix itself; anything else gets one more chance.
              if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
              return failureCount < 1;
            },
          },
        },
      }),
  );

  useEffect(() => {
    // One expired session anywhere sends the whole app back to sign-in.
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      const error: unknown = event.query.state.error;
      if (isApiError(error) && error.isAuthError) router.replace("/login?expired=1");
    });
    return unsubscribe;
  }, [client, router]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
