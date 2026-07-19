import { useQuery } from "@tanstack/react-query";
import { isGamePast } from "@turtleherder/shared";
import { useState } from "react";
import { useOutletContext } from "react-router";
import { fetchGames } from "../api.js";
import { Button } from "../components/Button.js";
import { PersonalQuestionCard } from "../components/PersonalQuestionCard.js";
import { GameCard } from "../GameCard.js";
import type { TeamOutletContext } from "../TeamLayout.js";
import styles from "./SchedulePage.module.css";

// Home page: the personal question about the next game, then the
// schedule. Past games hide behind a sticky toggle whose preference
// persists in localStorage (the original used a cookie).

export function SchedulePage() {
  const { team, me } = useOutletContext<TeamOutletContext>();
  const storageKey = `pastGames:${team.slug}`;
  const [showPast, setShowPast] = useState(
    () => localStorage.getItem(storageKey) === "showing",
  );

  const gamesQuery = useQuery({
    queryKey: ["games", team.slug],
    queryFn: () => fetchGames(team.slug),
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
  const past = gamesQuery.data.filter((g) => isGamePast(g.startsAt, now));
  const future = gamesQuery.data.filter((g) => !isGamePast(g.startsAt, now));
  // The personal question is about the next upcoming non-bye game
  // (games arrive sorted by start time); omitted when there is none.
  const nextGame = future.find((g) => g.opponentName !== null);

  return (
    <>
      {nextGame && <PersonalQuestionCard team={team} me={me} game={nextGame} />}

      <div className={styles.toggleBar}>
        <Button variant="secondary" small onClick={togglePast}>
          {showPast ? "Hide past games" : "Show past games"}
        </Button>
      </div>

      {showPast &&
        (past.length > 0 ? (
          <>
            <h2 className={styles.section}>Past games</h2>
            {past.map((game) => (
              <GameCard key={game.id} game={game} team={team} />
            ))}
          </>
        ) : (
          <p className={styles.empty}>No past games.</p>
        ))}

      {future.length > 0 && (
        <>
          <h2 className={styles.section}>Future games</h2>
          {future.map((game) => (
            <GameCard key={game.id} game={game} team={team} />
          ))}
        </>
      )}
    </>
  );
}
