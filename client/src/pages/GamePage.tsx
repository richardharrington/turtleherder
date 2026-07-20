import { useQuery } from "@tanstack/react-query";
import { isGamePast } from "@turtleherder/shared";
import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router";
import { fetchGame } from "../api.js";
import { StatusStrip } from "../components/StatusStrip.js";
import { GameCard } from "../GameCard.js";
import type { TeamOutletContext } from "../TeamLayout.js";

export function GamePage() {
  const { team, me } = useOutletContext<TeamOutletContext>();
  const { gameId } = useParams<"gameId">();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const gameQuery = useQuery({ queryKey: ["games", team.slug, gameId], queryFn: () => fetchGame(team.slug, gameId!), enabled: gameId !== undefined });
  if (gameQuery.isPending) return <p>Loading…</p>;
  if (gameQuery.isError) return <p className="error">Game not found.</p>;
  const game = gameQuery.data;
  return (
    <>
      {game.opponentName !== null && !isGamePast(game.startsAt) && <StatusStrip game={game} team={team} me={me} onOpen={setOpenRow} />}
      <GameCard game={game} team={team} meId={me.playerId} openRow={openRow} onOpenRow={setOpenRow} />
      <p><Link to={`/${team.slug}`}>See the whole schedule</Link></p>
    </>
  );
}
