import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router";
import { deletePlayer, fetchPlayers } from "../api.js";
import { Button, ButtonLink } from "../components/Button.js";
import type { TeamOutletContext } from "../TeamLayout.js";
import styles from "./ListPage.module.css";

// Manage roster, ported from legacy/bobcats/players.php. The delete
// confirmation page becomes a confirm dialog with the same wording.
export function PlayersPage() {
  const { team } = useOutletContext<TeamOutletContext>();
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
      <ul className={styles.list}>
        {playersQuery.data.map((player) => (
          <li key={player.id} className={styles.row}>
            <span className={styles.rowLabel}>{player.name}</span>
            <span className={styles.rowActions}>
              <ButtonLink
                variant="secondary"
                small
                to={`/${team.slug}/players/${player.id}/edit`}
              >
                Edit
              </ButtonLink>
              <Button
                variant="danger"
                small
                onClick={() => {
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
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {deleteMutation.isError && (
        <p className="error">Error deleting player from database!</p>
      )}
      <p>
        <ButtonLink to={`/${team.slug}/players/new`}>Add new player</ButtonLink>
      </p>
    </>
  );
}
