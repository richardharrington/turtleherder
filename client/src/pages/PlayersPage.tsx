import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useOutletContext } from "react-router";
import {
  addBackPlayer,
  ApiError,
  fetchFormerPlayers,
  fetchPlayers,
  removePlayer,
} from "../api.js";
import { Button, ButtonLink } from "../components/Button.js";
import { formatPlainDate } from "../format.js";
import type { TeamOutletContext } from "../TeamLayout.js";
import styles from "./ListPage.module.css";

// Manage roster, ported from legacy/bobcats/players.php. Removing a player
// is a soft close (their game history stays); captains additionally see a
// collapsed "Former players" list with an "Add back" that reopens a stint
// on the same row — the only route to undo an accidental removal.
export function PlayersPage() {
  const { team, me } = useOutletContext<TeamOutletContext>();
  const queryClient = useQueryClient();
  const storageKey = `formerPlayers:${team.slug}`;
  const [showFormer, setShowFormer] = useState(
    () => localStorage.getItem(storageKey) === "showing",
  );

  const playersQuery = useQuery({
    queryKey: ["players", team.slug],
    queryFn: () => fetchPlayers(team.slug),
  });

  const formerQuery = useQuery({
    queryKey: ["players", team.slug, "former"],
    queryFn: () => fetchFormerPlayers(team.slug),
    enabled: me.isCaptain,
  });

  function invalidateRoster() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["players", team.slug] }),
      // The roster change affects every game's attendance list.
      queryClient.invalidateQueries({ queryKey: ["games", team.slug] }),
    ]);
  }

  const removeMutation = useMutation({
    mutationFn: (playerId: number) => removePlayer(team.slug, playerId),
    onSuccess: invalidateRoster,
  });

  const addBackMutation = useMutation({
    mutationFn: (playerId: number) => addBackPlayer(team.slug, playerId),
    onSuccess: invalidateRoster,
  });

  function toggleFormer() {
    const next = !showFormer;
    setShowFormer(next);
    localStorage.setItem(storageKey, next ? "showing" : "hiding");
  }

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
                      `Remove ${player.name} from the roster? Their game ` +
                        `history stays, and a captain can add them back later.`,
                    )
                  ) {
                    removeMutation.mutate(player.id);
                  }
                }}
              >
                Remove
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {removeMutation.isError && (
        <p className="error">
          {removeMutation.error instanceof ApiError &&
          removeMutation.error.serverError === "last captain"
            ? "The team's only captain can't be removed from the roster."
            : "Error removing player from the roster!"}
        </p>
      )}
      <p>
        <ButtonLink to={`/${team.slug}/players/new`}>Add new player</ButtonLink>
      </p>

      {me.isCaptain && (
        <>
          <div className={styles.toggleBar}>
            <Button variant="secondary" small onClick={toggleFormer}>
              {showFormer ? "Hide former players" : "Show former players"}
            </Button>
          </div>
          {showFormer &&
            (formerQuery.isPending ? (
              <p>Loading…</p>
            ) : formerQuery.isError ? (
              <p className="error">Error loading former players.</p>
            ) : formerQuery.data.length === 0 ? (
              <p className={styles.empty}>No former players.</p>
            ) : (
              <>
                <h2 className={styles.section}>Former players</h2>
                <ul className={styles.list}>
                  {formerQuery.data.map((player) => (
                    <li key={player.id} className={styles.row}>
                      <span className={styles.rowLabel}>
                        {player.name}{" "}
                        <span className={styles.rowNote}>
                          Left {formatPlainDate(player.leftAt, team.timezone)}
                        </span>
                      </span>
                      <span className={styles.rowActions}>
                        <Button
                          variant="secondary"
                          small
                          disabled={addBackMutation.isPending}
                          onClick={() => addBackMutation.mutate(player.id)}
                        >
                          Add back
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
                {addBackMutation.isError && (
                  <p className="error">Error adding player back!</p>
                )}
              </>
            ))}
        </>
      )}
    </>
  );
}
