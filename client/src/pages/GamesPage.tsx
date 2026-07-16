import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GameWithAttendance } from "@turtleherder/shared";
import { useState } from "react";
import { useOutletContext } from "react-router";
import { deleteGame, fetchGames } from "../api.js";
import { Button, ButtonLink } from "../components/Button.js";
import { formatGameDate, formatGameTime } from "../format.js";
import type { TeamOutletContext } from "../TeamLayout.js";
import styles from "./ListPage.module.css";

// Manage games, ported from legacy/bobcats/games.php: past/future
// sections with their own persisted toggle, one row per game with
// Edit/Delete. The delete confirmation page becomes a confirm dialog
// with the same wording.
export function GamesPage() {
  const { team } = useOutletContext<TeamOutletContext>();
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

  function gameRow(game: GameWithAttendance) {
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
      <li key={game.id} className={styles.row}>
        <span className={styles.rowLabel}>{label}</span>
        <span className={styles.rowActions}>
          <ButtonLink
            variant="secondary"
            small
            to={`/${team.slug}/games/${game.id}/edit`}
          >
            Edit
          </ButtonLink>
          <Button
            variant="danger"
            small
            onClick={() => {
              if (window.confirm(confirmText)) {
                deleteMutation.mutate(game.id);
              }
            }}
          >
            Delete
          </Button>
        </span>
      </li>
    );
  }

  return (
    <>
      <div className={styles.toggleBar}>
        <Button variant="secondary" small onClick={togglePast}>
          {showPast ? "Hide past games" : "Show past games"}
        </Button>
      </div>

      {showPast &&
        (past.length > 0 ? (
          <>
            <h2 className={styles.section}>Past games</h2>
            <ul className={styles.list}>{past.map(gameRow)}</ul>
          </>
        ) : (
          <p className={styles.empty}>No past games.</p>
        ))}

      {future.length > 0 && (
        <>
          <h2 className={styles.section}>Future games</h2>
          <ul className={styles.list}>{future.map(gameRow)}</ul>
        </>
      )}

      {deleteMutation.isError && (
        <p className="error">Error deleting game from database!</p>
      )}
      <p>
        <ButtonLink to={`/${team.slug}/games/new`}>Add new game</ButtonLink>
      </p>
    </>
  );
}
