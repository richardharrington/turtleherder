import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { ApiError } from "./api.js";
import { routes } from "./App.js";
import "./main.css";

// The wall, half of it: any 401 from any query or mutation — first visit,
// expired session, or a captain revoking your link mid-browse — bounces to
// the wall page at "/". A hard navigation (not a router transition) so the
// query cache and all component state start clean. The wall page itself
// lives at "/" and never triggers this (its only fetch is guarded below).
//
// ?from= carries the slug the visitor was trying to reach (their own typed
// URL, so nothing leaks): it tells the wall to explain the missing team key
// instead of auto-forwarding to another team on the keyring.
function onAuthError(error: unknown) {
  if (
    error instanceof ApiError &&
    error.status === 401 &&
    window.location.pathname !== "/"
  ) {
    const slug = window.location.pathname.split("/")[1];
    window.location.assign(
      slug ? `/?from=${encodeURIComponent(slug)}` : "/",
    );
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      // 4xx responses are deliberate answers (401 wall, 403 captain
      // gate, 404), not flakiness — retrying them just delays the UI.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) &&
        failureCount < 3,
    },
  },
});

const router = createBrowserRouter(routes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
