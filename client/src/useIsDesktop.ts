import { useSyncExternalStore } from "react";

// The management/access pages render a touch list below 1024px and a real
// table at or above it (the milestone 5.75 breakpoint). Rendered as one
// or the other — not both behind CSS — so an open inline draft exists
// exactly once and owns the page's dirty state alone.

const QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, () =>
    window.matchMedia(QUERY).matches,
  );
}
