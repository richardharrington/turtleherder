import type {
  AttendanceStatus,
  Game,
  GameInput,
  GameWithAttendance,
  Player,
  PlayerInput,
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

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function fetchPlayers(slug: string): Promise<Player[]> {
  return toJson(await fetch(`${teamUrl(slug)}/players`), "fetch players");
}

export async function createPlayer(
  slug: string,
  input: PlayerInput,
): Promise<Player> {
  return toJson(
    await fetch(`${teamUrl(slug)}/players`, jsonInit("POST", input)),
    "create player",
  );
}

export async function updatePlayer(
  slug: string,
  playerId: number,
  input: PlayerInput,
): Promise<Player> {
  return toJson(
    await fetch(`${teamUrl(slug)}/players/${playerId}`, jsonInit("PUT", input)),
    "update player",
  );
}

export async function deletePlayer(
  slug: string,
  playerId: number,
): Promise<void> {
  const res = await fetch(`${teamUrl(slug)}/players/${playerId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`delete player failed: ${res.status}`);
  }
}

export async function createGame(
  slug: string,
  input: GameInput,
): Promise<Game> {
  return toJson(
    await fetch(`${teamUrl(slug)}/games`, jsonInit("POST", input)),
    "create game",
  );
}

export async function updateGame(
  slug: string,
  gameId: number,
  input: GameInput,
): Promise<Game> {
  return toJson(
    await fetch(`${teamUrl(slug)}/games/${gameId}`, jsonInit("PUT", input)),
    "update game",
  );
}

export async function deleteGame(slug: string, gameId: number): Promise<void> {
  const res = await fetch(`${teamUrl(slug)}/games/${gameId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`delete game failed: ${res.status}`);
  }
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
