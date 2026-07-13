import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GameWithAttendance, Team } from "@turtleherder/shared";
import { useState } from "react";
import { Link, useOutletContext } from "react-router";
import { deleteGame, fetchGames } from "../api.js";
import { formatGameDate, formatGameTime } from "../format.js";

// Manage games, ported from legacy/bobcats/games.php: past/future
// sections with their own persisted toggle, one line per game with
// Edit/Delete. The delete confirmation page becomes a confirm dialog
// with the same wording.
export function GamesPage() {
  const team = useOutletContext<Team>();
  const queryClient = useQueryClient();
  const storageKey = `pastGames:${team.slug}:manage`;
  const [showPast, setShowPast] = useState(
    () => localStorage.getItem(storageKey) === "showing",
  );

  const gamesQuery = useQuery({
    queryKey: ["games", team.slug],
    queryFn: () => fetchGames(team.slug),
  });

  const deleteMutation = useMutation({
    mutationFn: (gameId: number) => deleteGame(team.slug, gameId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["games", team.slug] }),
  });

  function togglePast() {
    const next = !showPast;
    setShowPast(next);
    localStorage.setItem(storageKey, next ? "showing" : "hiding");
  }

  if (gamesQuery.isPending) {
    return <p>Loading…</p>;
  }
  if (gamesQuery.isError) {
    return <p className="error">Error loading games.</p>;
  }

  const now = Date.now();
  const past = gamesQuery.data.filter(
    (g) => new Date(g.startsAt).getTime() <= now,
  );
  const future = gamesQuery.data.filter(
    (g) => new Date(g.startsAt).getTime() > now,
  );

  function gameLine(game: GameWithAttendance) {
    const date = formatGameDate(game.startsAt, team.timezone);
    const time = formatGameTime(game.startsAt, team.timezone);
    const label =
      game.opponentName === null
        ? `Bye week on ${date}`
        : `${game.opponentName} on ${date} at ${time}`;
    const confirmText =
      game.opponentName === null
        ? `Do you really want to delete the bye week on ${date}?`
        : `Do you really want to delete the game against ${game.opponentName} on ${date} at ${time}?`;
    return (
      <p key={game.id} className="list1">
        {label} <Link to={`/${team.slug}/games/${game.id}/edit`}>Edit</Link>{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (window.confirm(confirmText)) {
              deleteMutation.mutate(game.id);
            }
          }}
        >
          Delete
        </a>
      </p>
    );
  }

  return (
    <>
      <p>
        <span className="style1">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              togglePast();
            }}
          >
            {showPast ? "Hide past games" : "Show past games"}
          </a>
        </span>
      </p>

      {showPast &&
        (past.length > 0 ? (
          <>
            <p>
              <span className="style1">
                <strong>Past games:</strong>
              </span>
            </p>
            {past.map(gameLine)}
          </>
        ) : (
          <p>
            <span className="style1">
              <strong>No past games.</strong>
            </span>
          </p>
        ))}

      {future.length > 0 && (
        <>
          <p>
            <span className="style1">
              <strong>Future games:</strong>
            </span>
          </p>
          {future.map(gameLine)}
        </>
      )}

      {deleteMutation.isError && (
        <p className="error">Error deleting game from database!</p>
      )}
      <br />
      <p>
        <Link to={`/${team.slug}/games/new`}>Add new game</Link>
      </p>
      <br />
    </>
  );
}
