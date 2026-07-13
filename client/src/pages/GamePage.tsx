import { useQuery } from "@tanstack/react-query";
import type { Team } from "@turtleherder/shared";
import { Link, useOutletContext, useParams } from "react-router";
import { fetchGame } from "../api.js";
import { GameCard } from "../GameCard.js";

// A single game with the same inline attendance controls as the
// schedule — the shareable "set your status for Sunday" link.
export function GamePage() {
  const team = useOutletContext<Team>();
  const { gameId } = useParams<"gameId">();

  const gameQuery = useQuery({
    queryKey: ["games", team.slug, gameId],
    queryFn: () => fetchGame(team.slug, gameId!),
    enabled: gameId !== undefined,
  });

  if (gameQuery.isPending) {
    return <p>Loading…</p>;
  }
  if (gameQuery.isError) {
    return <p className="error">Game not found.</p>;
  }

  return (
    <>
      <GameCard game={gameQuery.data} team={team} />
      <p>
        <Link to={`/${team.slug}`}>See the whole schedule</Link>
      </p>
    </>
  );
}
