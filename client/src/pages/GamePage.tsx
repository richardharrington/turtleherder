import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext, useParams } from "react-router";
import { fetchGame } from "../api.js";
import { PersonalQuestionCard } from "../components/PersonalQuestionCard.js";
import { GameCard } from "../GameCard.js";
import type { TeamOutletContext } from "../TeamLayout.js";

// A single game with the same inline attendance controls as the
// schedule — the shareable "set your status for Sunday" link. The
// personal question at the top is about this game (omitted for byes).
export function GamePage() {
  const { team, me } = useOutletContext<TeamOutletContext>();
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
      <PersonalQuestionCard team={team} me={me} game={gameQuery.data} />
      <GameCard game={gameQuery.data} team={team} />
      <p>
        <Link to={`/${team.slug}`}>See the whole schedule</Link>
      </p>
    </>
  );
}
