import type {
  AttendanceStatus,
  CreateTeamInput,
  CreateTeamResult,
  FormerPlayer,
  Game,
  GameInput,
  GameWithAttendance,
  Me,
  Player,
  PlayerAccess,
  PlayerInput,
  SessionTeam,
  Team,
  TeamSettingsInput,
} from "@turtleherder/shared";

// Thin typed wrappers around the REST API. Every endpoint gets a
// function here; components only ever go through these.

// Carries the HTTP status so callers can distinguish the auth wall
// (401, handled globally in main.tsx) from captain-gating (403) and
// ordinary failures, plus the server's error string for statuses that
// are ambiguous alone (e.g. a 409 from purge: history vs. last captain).
export class ApiError extends Error {
  constructor(
    readonly status: number,
    label: string,
    readonly serverError: string | null = null,
  ) {
    super(`${label} failed: ${status}`);
    this.name = "ApiError";
  }
}

async function apiError(res: Response, label: string): Promise<ApiError> {
  let serverError: string | null = null;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") serverError = body.error;
  } catch {
    // Not a JSON error body; the status alone will have to do.
  }
  return new ApiError(res.status, label, serverError);
}

async function toJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    throw await apiError(res, label);
  }
  return res.json() as Promise<T>;
}

function teamUrl(slug: string): string {
  return `/api/teams/${encodeURIComponent(slug)}`;
}

export async function createTeam(
  input: CreateTeamInput,
): Promise<CreateTeamResult> {
  return toJson(
    await fetch("/api/teams", jsonInit("POST", input)),
    "create team",
  );
}

export async function fetchTeam(slug: string): Promise<Team> {
  return toJson(await fetch(teamUrl(slug)), "fetch team");
}

export async function updateTeamSettings(
  slug: string,
  input: TeamSettingsInput,
): Promise<Team> {
  return toJson(
    await fetch(`${teamUrl(slug)}/settings`, jsonInit("PUT", input)),
    "update team settings",
  );
}

export async function fetchMe(slug: string): Promise<Me> {
  return toJson(await fetch(`${teamUrl(slug)}/me`), "fetch me");
}

export async function fetchSessionTeams(): Promise<SessionTeam[]> {
  return toJson(await fetch("/api/session/teams"), "fetch session teams");
}

export async function signOut(): Promise<void> {
  const res = await fetch("/api/session/sign-out", { method: "POST" });
  if (!res.ok) throw await apiError(res, "sign out");
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

// A soft removal (closes the membership stint); the player moves to the
// captains-only Former players list and can be added back.
export async function removePlayer(
  slug: string,
  playerId: number,
): Promise<void> {
  const res = await fetch(`${teamUrl(slug)}/players/${playerId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw await apiError(res, "remove player");
  }
}

// ---- Former players (captains only) ----

export async function fetchFormerPlayers(
  slug: string,
): Promise<FormerPlayer[]> {
  return toJson(
    await fetch(`${teamUrl(slug)}/players/former`),
    "fetch former players",
  );
}

export async function addBackPlayer(
  slug: string,
  playerId: number,
): Promise<Player> {
  return toJson(
    await fetch(`${teamUrl(slug)}/players/${playerId}/add-back`, {
      method: "POST",
    }),
    "add back player",
  );
}

// The hard delete; the server refuses (409) when any attendance exists.
export async function purgePlayer(
  slug: string,
  playerId: number,
): Promise<void> {
  const res = await fetch(`${teamUrl(slug)}/players/${playerId}/purge`, {
    method: "POST",
  });
  if (!res.ok) {
    throw await apiError(res, "purge player");
  }
}

// ---- Access management (captains only) ----

export async function fetchAccess(slug: string): Promise<PlayerAccess[]> {
  return toJson(await fetch(`${teamUrl(slug)}/access`), "fetch access list");
}

export async function regenerateToken(
  slug: string,
  playerId: number,
): Promise<PlayerAccess> {
  return toJson(
    await fetch(`${teamUrl(slug)}/players/${playerId}/regenerate-token`, {
      method: "POST",
    }),
    "regenerate token",
  );
}

export async function promotePlayer(
  slug: string,
  playerId: number,
): Promise<void> {
  const res = await fetch(`${teamUrl(slug)}/players/${playerId}/promote`, {
    method: "POST",
  });
  if (!res.ok) throw await apiError(res, "promote player");
}

export async function demotePlayer(
  slug: string,
  playerId: number,
): Promise<void> {
  const res = await fetch(`${teamUrl(slug)}/players/${playerId}/demote`, {
    method: "POST",
  });
  if (!res.ok) throw await apiError(res, "demote player");
}

export async function revokeToken(
  slug: string,
  playerId: number,
): Promise<PlayerAccess> {
  return toJson(
    await fetch(`${teamUrl(slug)}/players/${playerId}/revoke-token`, {
      method: "POST",
    }),
    "revoke token",
  );
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
    throw new ApiError(res.status, "delete game");
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
