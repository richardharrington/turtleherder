import type {
  AttendanceStatus,
  GameWithAttendance,
  Team,
} from "@turtleherder/shared";

// Thin typed wrappers around the REST API. Every endpoint gets a
// function here; components only ever go through these.

async function toJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    throw new Error(`${label} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function teamUrl(slug: string): string {
  return `/api/teams/${encodeURIComponent(slug)}`;
}

export async function fetchTeam(slug: string): Promise<Team> {
  return toJson(await fetch(teamUrl(slug)), "fetch team");
}

export async function fetchGames(slug: string): Promise<GameWithAttendance[]> {
  return toJson(await fetch(`${teamUrl(slug)}/games`), "fetch games");
}

export async function fetchGame(
  slug: string,
  gameId: string,
): Promise<GameWithAttendance> {
  return toJson(await fetch(`${teamUrl(slug)}/games/${gameId}`), "fetch game");
}

export async function putAttendance(
  slug: string,
  gameId: number,
  playerId: number,
  status: AttendanceStatus,
): Promise<void> {
  await toJson(
    await fetch(`${teamUrl(slug)}/games/${gameId}/attendance/${playerId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }),
    "update attendance",
  );
}
