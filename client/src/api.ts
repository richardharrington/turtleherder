import type { Team } from "@turtleherder/shared";

// Thin typed wrappers around the REST API. Every endpoint gets a
// function here; components only ever go through these.

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchTeam(slug: string): Promise<Team> {
  return getJson<Team>(`/api/teams/${encodeURIComponent(slug)}`);
}
