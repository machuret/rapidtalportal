"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * App-wide React Query provider for the portal.
 *
 * Mounted once in the portal layout so every page under /(portal) has a
 * QueryClient in context. Previously only VaultClient and ContentStudio hosted
 * their own local providers, which meant any other React-Query page (e.g. the
 * admin tables, daily-log feedback) crashed with "No QueryClient set".
 *
 * The client is created lazily in useState so it's stable across re-renders but
 * still per-request on the server (avoids leaking cache between users in SSR).
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000,
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
