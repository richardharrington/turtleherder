import { useQuery } from "@tanstack/react-query";
import { isGamePast } from "@turtleherder/shared";
import { useState } from "react";
import { useOutletContext } from "react-router";
import { fetchGames } from "../api.js";
import { Chevron, Expander } from "../components/disclosure.js";
import { StatusStrip } from "../components/StatusStrip.js";
import { GameCard } from "../GameCard.js";
import type { TeamOutletContext } from "../TeamLayout.js";
import styles from "./SchedulePage.module.css";

// The schedule (milestone 5.8): upcoming games nearest-first, then all
// past games behind an always-counted disclosure, most recent first. The
// per-team visibility preference persists as before.
export function SchedulePage() {
  const { team, me } = useOutletContext<TeamOutletContext>();
  const storageKey = `pastGames:${team.slug}`;
  const [showPast, setShowPast] = useState(() => localStorage.getItem(storageKey) === "showing");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const gamesQuery = useQuery({ queryKey: ["games", team.slug], queryFn: () => fetchGames(team.slug) });

  function togglePast() {
    const next = !showPast;
    setShowPast(next);
    localStorage.setItem(storageKey, next ? "showing" : "hiding");
  }

  if (gamesQuery.isPending) return <p>Loading…</p>;
  if (gamesQuery.isError) return <p className="error">Error loading games.</p>;

  const now = Date.now();
  const past = gamesQuery.data.filter((g) => isGamePast(g.startsAt, now)).reverse();
  const upcoming = gamesQuery.data.filter((g) => !isGamePast(g.startsAt, now));
  const nextGame = upcoming.find((g) => g.opponentName !== null);
  const card = (game: (typeof gamesQuery.data)[number]) => (
    <GameCard key={game.id} game={game} team={team} meId={me.playerId} openRow={openRow} onOpenRow={setOpenRow} />
  );

  return (
    <>
      {nextGame && <StatusStrip game={nextGame} team={team} me={me} onOpen={setOpenRow} />}

      <h2 className={styles.section}>Upcoming games</h2>
      {upcoming.length > 0 ? (
        upcoming.map(card)
      ) : (
        <p className={styles.empty}>No upcoming games.</p>
      )}

      <section className={styles.pastSection}>
        <button
          type="button"
          className={styles.pastDisclosure}
          aria-expanded={showPast}
          onClick={togglePast}
        >
          <span>Past games ({past.length})</span>
          <Chevron open={showPast} />
        </button>
        <Expander open={showPast}>
          <div className={styles.pastList}>
            {past.length > 0 ? past.map(card) : <p className={styles.empty}>No past games.</p>}
          </div>
        </Expander>
      </section>
    </>
  );
}
