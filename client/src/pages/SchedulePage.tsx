import { useQuery } from "@tanstack/react-query";
import type { Team } from "@turtleherder/shared";
import { useState } from "react";
import { useOutletContext } from "react-router";
import { fetchGames } from "../api.js";
import { GameCard } from "../GameCard.js";

// Home page: the game schedule, ported from legacy/bobcats/index.php.
// Past games hide behind a toggle whose preference persists in
// localStorage (the original used a cookie).

export function SchedulePage() {
  const team = useOutletContext<Team>();
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
  const past = gamesQuery.data.filter(
    (g) => new Date(g.startsAt).getTime() <= now,
  );
  const future = gamesQuery.data.filter(
    (g) => new Date(g.startsAt).getTime() > now,
  );

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
              <span className="style3">
                <strong>Past games:</strong>
              </span>
            </p>
            {past.map((game) => (
              <GameCard key={game.id} game={game} team={team} />
            ))}
          </>
        ) : (
          <p>
            <span className="style3">
              <strong>No past games.</strong>
            </span>
          </p>
        ))}

      {future.length > 0 && (
        <>
          <p>
            <span className="style3">
              <strong>Future games:</strong>
            </span>
          </p>
          {future.map((game) => (
            <GameCard key={game.id} game={game} team={team} />
          ))}
        </>
      )}
    </>
  );
}
