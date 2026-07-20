import { useQuery } from "@tanstack/react-query";
import { isGamePast } from "@turtleherder/shared";
import { useState } from "react";
import { useOutletContext } from "react-router";
import { fetchGames } from "../api.js";
import { Button } from "../components/Button.js";
import { StatusStrip } from "../components/StatusStrip.js";
import { GameCard } from "../GameCard.js";
import type { TeamOutletContext } from "../TeamLayout.js";
import styles from "./SchedulePage.module.css";

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
  const past = gamesQuery.data.filter((g) => isGamePast(g.startsAt, now));
  const future = gamesQuery.data.filter((g) => !isGamePast(g.startsAt, now));
  const nextGame = future.find((g) => g.opponentName !== null);
  const card = (game: (typeof gamesQuery.data)[number]) => (
    <GameCard key={game.id} game={game} team={team} meId={me.playerId} openRow={openRow} onOpenRow={setOpenRow} />
  );

  return (
    <>
      {nextGame && <StatusStrip game={nextGame} team={team} me={me} onOpen={setOpenRow} />}
      <div className={styles.toggleBar}><Button variant="secondary" small onClick={togglePast}>{showPast ? "Hide past games" : "Show past games"}</Button></div>
      {showPast && (past.length > 0 ? <><h2 className={styles.section}>Past games</h2>{past.map(card)}</> : <p className={styles.empty}>No past games.</p>)}
      {future.length > 0 && <><h2 className={styles.section}>Future games</h2>{future.map(card)}</>}
    </>
  );
}
