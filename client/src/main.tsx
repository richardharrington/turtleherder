import "@fontsource-variable/inter";
import "@fontsource/merriweather/700.css";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ApiError } from "./api.js";
import { App } from "./App.js";
import "./main.css";

// The wall, half of it: any 401 from any query or mutation — first visit,
// expired session, or a captain revoking your link mid-browse — bounces to
// the wall page at "/". A hard navigation (not a router transition) so the
// query cache and all component state start clean. The wall page itself
// lives at "/" and never triggers this (its only fetch is guarded below).
//
// ?from= carries the slug the visitor was trying to reach (their own typed
// URL, so nothing leaks): it tells the wall to explain itself instead of
// auto-forwarding a one-team-at-a-time session to some *other* team.
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
