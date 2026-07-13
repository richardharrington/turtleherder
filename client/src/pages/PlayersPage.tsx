import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Team } from "@turtleherder/shared";
import { Link, useOutletContext } from "react-router";
import { deletePlayer, fetchPlayers } from "../api.js";

// Manage roster, ported from legacy/bobcats/players.php. The delete
// confirmation page becomes a confirm dialog with the same wording.
export function PlayersPage() {
  const team = useOutletContext<Team>();
  const queryClient = useQueryClient();

  const playersQuery = useQuery({
    queryKey: ["players", team.slug],
    queryFn: () => fetchPlayers(team.slug),
  });

  const deleteMutation = useMutation({
    mutationFn: (playerId: number) => deletePlayer(team.slug, playerId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["players", team.slug] }),
        // The roster change affects every game's attendance list.
        queryClient.invalidateQueries({ queryKey: ["games", team.slug] }),
      ]),
  });

  if (playersQuery.isPending) {
    return <p>Loading…</p>;
  }
  if (playersQuery.isError) {
    return <p className="error">Error loading players.</p>;
  }

  return (
    <>
      {playersQuery.data.map((player) => (
        <p key={player.id}>
          {player.name}{" "}
          <Link to={`/${team.slug}/players/${player.id}/edit`}>Edit</Link>{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              if (
                window.confirm(
                  `Do you really want to delete ${player.name} from the roster?`,
                )
              ) {
                deleteMutation.mutate(player.id);
              }
            }}
          >
            Delete
          </a>
        </p>
      ))}
      {deleteMutation.isError && (
        <p className="error">Error deleting player from database!</p>
      )}
      <br />
      <p>
        <Link to={`/${team.slug}/players/new`}>Add new player</Link>
      </p>
      <br />
    </>
  );
}
